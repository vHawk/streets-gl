import ControlsNavigator from "./ControlsNavigator";
import Vec2 from "~/lib/math/Vec2";
import Vec3 from "~/lib/math/Vec3";
import Config from "../Config";
import MathUtils from "~/lib/math/MathUtils";
import CursorStyleSystem from "../systems/CursorStyleSystem";
import ControlsSystem, {ControlsState} from "../systems/ControlsSystem";
import PerspectiveCamera from "~/lib/core/PerspectiveCamera";
import TerrainHeightProvider from "~/app/terrain/TerrainHeightProvider";
import FreeControlsNavigator from "~/app/controls/FreeControlsNavigator";
import Mat4 from "~/lib/math/Mat4";
import SlippyControlsNavigator from "~/app/controls/SlippyControlsNavigator";
import Easing from "~/lib/math/Easing";

enum TransitionType {
	FromSlippy,
	ToSlippy
}

export default class GroundControlsNavigator extends ControlsNavigator {
	private readonly camera: PerspectiveCamera;
	private readonly cursorStyleSystem: CursorStyleSystem;
	private readonly terrainHeightProvider: TerrainHeightProvider;
	private readonly parent: ControlsSystem;
	public target: Vec3 = new Vec3();
	private direction: Vec3 = new Vec3();
	public distance: number = 0;
	private distanceTarget: number = 0;
	public pitch: number = MathUtils.toRad(45);
	public yaw: number = MathUtils.toRad(0);
	private isLMBDown: boolean = false;
	private isRMBDown: boolean = false;
	private LMBDownPosition: Vec2 = null;
	private lastLMBMoveEvent: Vec2 = null;
	private forwardKeyPressed: boolean = false;
	private leftKeyPressed: boolean = false;
	private rightKeyPressed: boolean = false;
	private backwardKeyPressed: boolean = false;
	private fastMovementKeyPressed: boolean = false;
	private pitchMinusKeyPressed: boolean = false;
	private pitchPlusKeyPressed: boolean = false;
	private yawMinusKeyPressed: boolean = false;
	private yawPlusKeyPressed: boolean = false;
	private pointerPosition: Vec2 = new Vec2(0, 0);
	private isInTransition: boolean = false;
	private transitionType: TransitionType = null;
	private transitionStart: number = 0;
	public slippyMapOverlayFactor: number = 0;
	public switchToSlippy: boolean = false;
	private transitionYawFrom: number = 0;
	private transitionPitchFrom: number = 0;
	private bikeMode: boolean = false;

	public constructor(
		element: HTMLElement,
		camera: PerspectiveCamera,
		cursorStyleSystem: CursorStyleSystem,
		terrainHeightProvider: TerrainHeightProvider,
		parent: ControlsSystem
	) {
		super(element);

		this.camera = camera;
		this.cursorStyleSystem = cursorStyleSystem;
		this.terrainHeightProvider = terrainHeightProvider;
		this.parent = parent;

		this.addEventListeners();
	}

	private addEventListeners(): void {
		this.element.addEventListener('mousedown', (e: MouseEvent) => this.mouseDownEvent(e));
		this.element.addEventListener('mouseleave', (e: MouseEvent) => this.mouseLeaveEvent(e));
		this.element.addEventListener('mouseup', (e: MouseEvent) => this.mouseUpEvent(e));
		this.element.addEventListener('mousemove', (e: MouseEvent) => this.mouseMoveEvent(e));
		this.element.addEventListener('wheel', (e: WheelEvent) => this.wheelEvent(e));
		document.addEventListener('keydown', (e: KeyboardEvent) => this.keyDownEvent(e));
		document.addEventListener('keyup', (e: KeyboardEvent) => this.keyUpEvent(e));
	}

	public lookAtNorth(): void {
		this.yaw = 0;
	}

	private mouseDownEvent(e: MouseEvent): void {
		if (!this.isEnabled) {
			return;
		}

		e.preventDefault();

		switch (e.button) {
			case 0: {
				this.isLMBDown = true;
				this.LMBDownPosition = this.projectOnGround(e.clientX, e.clientY);
				break;
			}
			case 2: {
				this.isRMBDown = true;
				break;
			}
		}
	}

	private mouseLeaveEvent(e: MouseEvent): void {
		if (!this.isEnabled) {
			return;
		}

		this.cursorStyleSystem.disableGrabbing();

		this.isRMBDown = false;
		this.isLMBDown = false;
		this.LMBDownPosition = null;
		this.lastLMBMoveEvent = null;
	}

	private mouseUpEvent(e: MouseEvent): void {
		if (!this.isEnabled) {
			return;
		}

		this.cursorStyleSystem.disableGrabbing();

		switch (e.button) {
			case 0: {
				this.isLMBDown = false;
				this.LMBDownPosition = null;
				this.lastLMBMoveEvent = null;
				break;
			}
			case 2: {
				this.isRMBDown = false;
				break;
			}
		}
	}

	private mouseMoveEvent(e: MouseEvent): void {
		this.pointerPosition.set(
			e.clientX / window.innerWidth * 2 - 1,
			-e.clientY / window.innerHeight * 2 + 1,
		);

		if (!this.isEnabled || this.isInTransition) {
			return;
		}

		if (this.isRMBDown || this.isLMBDown) {
			this.cursorStyleSystem.enableGrabbing();
		}

		if (this.isRMBDown) {
			this.yaw += MathUtils.toRad(e.movementX) * 0.25;
			this.pitch += MathUtils.toRad(e.movementY) * 0.25;
		}

		if (this.isLMBDown) {
			this.lastLMBMoveEvent = new Vec2(e.clientX, e.clientY);
		}
	}

	private wheelEvent(e: WheelEvent): void {
		if (!this.isEnabled || this.isInTransition) {
			return;
		}

		e.preventDefault();

		const zoomSpeed = Config.CameraZoomSpeed * (e.ctrlKey ? Config.CameraZoomTrackpadFactor : 1);
		const logSpaceDistance = Math.log2(this.distanceTarget);
		const newLogSpaceDistance = logSpaceDistance + e.deltaY * zoomSpeed;

		this.distanceTarget = MathUtils.clamp(
			2 ** newLogSpaceDistance,
			Config.MinCameraDistance,
			Infinity
		);
	}

	private keyDownEvent(e: KeyboardEvent): void {
		if (!this.isEnabled || !this.isInFocus || e.ctrlKey || e.metaKey || e.altKey) {
			return;
		}

		switch (e.code) {
			case 'KeyW':
				this.forwardKeyPressed = true;
				break;
			case 'KeyA':
				this.leftKeyPressed = true;
				break;
			case 'KeyS':
				this.backwardKeyPressed = true;
				break;
			case 'ShiftLeft':
				this.fastMovementKeyPressed = true;
				break;
			case 'KeyD':
				this.rightKeyPressed = true;
				break;
			case 'KeyQ':
				this.yawPlusKeyPressed = true;
				break;
			case 'KeyE':
				this.yawMinusKeyPressed = true;
				break;
			case 'KeyR':
				this.pitchPlusKeyPressed = true;
				break;
			case 'KeyF':
				this.pitchMinusKeyPressed = true;
				break;
			case 'KeyB':
				this.parent.switchBikeMode();
				break;
		}
	}

	private keyUpEvent(e: KeyboardEvent): void {
		switch (e.code) {
			case 'KeyW':
				this.forwardKeyPressed = false;
				break;
			case 'KeyA':
				this.leftKeyPressed = false;
				break;
			case 'KeyS':
				this.backwardKeyPressed = false;
				break;
			case 'ShiftLeft':
				this.fastMovementKeyPressed = false;
				break;
			case 'KeyD':
				this.rightKeyPressed = false;
				break;
			case 'KeyQ':
				this.yawPlusKeyPressed = false;
				break;
			case 'KeyE':
				this.yawMinusKeyPressed = false;
				break;
			case 'KeyR':
				this.pitchPlusKeyPressed = false;
				break;
			case 'KeyF':
				this.pitchMinusKeyPressed = false;
				break;
		}
	}

	private moveTarget(dx: number, dy: number): void {
		const v = new Vec2(dx, dy);
		const v2 = new Vec2();

		const sin = Math.sin(this.yaw);
		const cos = Math.cos(this.yaw);
		v2.x = (cos * v.x) - (sin * v.y);
		v2.y = (sin * v.x) + (cos * v.y);

		this.target.x += v.x;
		this.target.z += v.y;
	}

	private projectOnGround(clientX: number, clientY: number): Vec2 {
		const screenPos = new Vec2(clientX, clientY);
		const screenSize = new Vec2(window.innerWidth, window.innerHeight);
		let vector = Vec3.unproject(new Vec3(
			screenPos.x / screenSize.x * 2 - 1,
			-screenPos.y / screenSize.y * 2 + 1,
			0.5
		), this.camera, false);

		vector = Vec3.sub(vector, this.camera.position);

		const distanceToGround = (this.camera.position.y - this.target.y) / vector.y;
		const vectorToGround = Vec3.multiplyScalar(vector, distanceToGround);
		const positionOnGround = Vec3.sub(this.camera.position, vectorToGround);

		return new Vec2(positionOnGround.x, positionOnGround.z);
	}

	private projectOnGroundPredict(x: number, y: number, distance: number): Vec2 {
		const oldMatrix = Mat4.copy(this.camera.matrix);

		const cameraOffset = Vec3.multiplyScalar(this.direction, -distance);
		const cameraPosition = Vec3.add(this.target, cameraOffset);
		this.camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
		this.camera.lookAt(this.target, false);

		let vector = Vec3.unproject(new Vec3(x, y, 0.5), this.camera, false);

		this.camera.matrix.values.set(oldMatrix.values);

		vector = Vec3.sub(vector, this.camera.position);

		const distanceToGround = (this.camera.position.y - this.target.y) / vector.y;
		const vectorToGround = Vec3.multiplyScalar(vector, distanceToGround);
		const positionOnGround = Vec3.sub(this.camera.position, vectorToGround);

		return new Vec2(positionOnGround.x, positionOnGround.z);
	}

	private updateDistance(deltaTime: number): void {
		const alpha = 1 - Math.pow(1 - 0.3, deltaTime / (1 / 60));

		const oldDistance = this.distance;
		let newDistance = MathUtils.lerp(this.distance, this.distanceTarget, alpha);

		if (Math.abs(newDistance - this.distanceTarget) < 0.001) {
			newDistance = this.distanceTarget;
		}

		const oldPosition = this.projectOnGroundPredict(this.pointerPosition.x, this.pointerPosition.y, oldDistance);
		const newPosition = this.projectOnGroundPredict(this.pointerPosition.x, this.pointerPosition.y, newDistance);

		this.target.x += oldPosition.x - newPosition.x;
		this.target.z += oldPosition.y - newPosition.y;
		this.distance = newDistance;

		if (this.distance > Config.MaxCameraDistance && !this.isInTransition) {
			this.startTransition(TransitionType.ToSlippy);
			this.transitionYawFrom = this.yaw;
			this.transitionPitchFrom = this.pitch;
		}
	}

	private clampPitchAndYaw(): void {
		this.pitch = MathUtils.clamp(
			this.pitch,
			MathUtils.toRad(Config.MinCameraPitch),
			MathUtils.toRad(Config.MaxCameraPitch)
		);
		this.yaw = MathUtils.normalizeAngle(this.yaw);
	}

	private updateTargetHeightFromHeightmap(): void {
		const currentHeight = this.terrainHeightProvider.getHeightGlobalInterpolated(this.target.x, this.target.z, true);

		if (currentHeight !== null) {
			this.target.y = currentHeight;
		}
	}

	public setBikeMode(bikeMode: boolean): void {
		this.bikeMode = bikeMode;
		this.updateCameraProjectionMatrix();
	}

	private updateCameraProjectionMatrix(): void {
		this.camera.near = this.bikeMode ? Config.BikeCameraNear : Config.CameraNear;
		this.camera.far = 100000;
		this.camera.updateProjectionMatrix();
	}

	public syncWithCamera(prevNavigator: ControlsNavigator): void {
		if (prevNavigator instanceof FreeControlsNavigator) {
			const mat = this.camera.matrixWorld.values;
			const forwardDir = Vec3.normalize(new Vec3(mat[8], mat[9], mat[10]));
			const [pitch, yaw] = MathUtils.cartesianToPolar(forwardDir);

			this.pitch = pitch;
			this.yaw = yaw;
			this.distance = this.distanceTarget = Config.MaxCameraDistance * 0.5;
			this.target.set(this.camera.position.x, 0, this.camera.position.z);
			this.updateTargetHeightFromHeightmap();
		} else if (prevNavigator instanceof SlippyControlsNavigator) {
			this.yaw = 0;
			this.pitch = MathUtils.toRad(Config.MaxCameraPitch);
			this.target.set(this.camera.position.x, 0, this.camera.position.z);
			this.updateTargetHeightFromHeightmap();
			this.distance = this.distanceTarget = prevNavigator.distance - 1;

			if (!this.isInTransition) {
				this.startTransition(TransitionType.FromSlippy);
			}
		}

		this.updateCameraProjectionMatrix();
	}

	public syncWithState(state: ControlsState): void {
		this.target.x = state.x;
		this.target.z = state.z;
		this.pitch = state.pitch;
		this.yaw = state.yaw;
		this.distance = this.distanceTarget = state.distance;

		this.updateCameraProjectionMatrix();
	}

	public getCurrentState(): ControlsState {
		return {
			x: this.target.x,
			z: this.target.z,
			pitch: this.pitch,
			yaw: this.yaw,
			distance: this.distance
		};
	}

	public override disable(): void {
		super.disable();
		this.cursorStyleSystem.disableGrabbing();
		this.isRMBDown = false;
		this.isLMBDown = false;
		this.LMBDownPosition = null;
		this.lastLMBMoveEvent = null;
	}

	private startTransition(type: TransitionType): void {
		this.isInTransition = true;
		this.transitionType = type;
		this.transitionStart = Date.now();
	}

	private processMovementByKeys(deltaTime: number): void {
		if (this.isInTransition) {
			return;
		}

		const mat = this.camera.matrixWorld.values;
		const forwardDir = Vec2.normalize(new Vec2(mat[8], mat[10]));
		const rightDir = Vec2.normalize(new Vec2(mat[0], mat[2]));
		const speed = this.fastMovementKeyPressed ? Config.GroundCameraSpeedFast : Config.GroundCameraSpeed;

		let movementDelta = new Vec2();
		if (this.forwardKeyPressed) {
			movementDelta = Vec2.add(movementDelta, Vec2.multiplyScalar(forwardDir, -deltaTime));
		}
		if (this.backwardKeyPressed) {
			movementDelta = Vec2.add(movementDelta, Vec2.multiplyScalar(forwardDir, deltaTime));
		}
		if (this.leftKeyPressed) {
			movementDelta = Vec2.add(movementDelta, Vec2.multiplyScalar(rightDir, -deltaTime));
		}
		if (this.rightKeyPressed) {
			movementDelta = Vec2.add(movementDelta, Vec2.multiplyScalar(rightDir, deltaTime));
		}
		movementDelta = Vec2.multiplyScalar(movementDelta, speed);

		this.target.x += movementDelta.x;
		this.target.z += movementDelta.y;

		if (this.yawPlusKeyPressed) {
			this.yaw += deltaTime * Config.FreeCameraYawSpeed;
		}
		if (this.yawMinusKeyPressed) {
			this.yaw -= deltaTime * Config.FreeCameraYawSpeed;
		}
		if (this.pitchMinusKeyPressed) {
			this.pitch -= deltaTime * Config.FreeCameraPitchSpeed;
		}
		if (this.pitchPlusKeyPressed) {
			this.pitch += deltaTime * Config.FreeCameraPitchSpeed;
		}
	}

	private doTransition(): void {
		if (!this.isInTransition) {
			return;
		}

		const duration = Config.SlippyMapTransitionDuration;
		const elapsed = Date.now() - this.transitionStart;
		const t = MathUtils.clamp(elapsed / duration, 0, 1);
		const tSmooth = Easing.easeOutCubic(t);

		switch (this.transitionType) {
			case TransitionType.ToSlippy: {
				this.slippyMapOverlayFactor = tSmooth;

				this.yaw = MathUtils.lerpAngle(this.transitionYawFrom, 0, tSmooth);
				this.pitch = MathUtils.lerp(this.transitionPitchFrom, MathUtils.toRad(Config.MaxCameraPitch), tSmooth);

				break;
			}
			case TransitionType.FromSlippy: {
				this.slippyMapOverlayFactor = 1 - tSmooth;

				this.yaw = 0;
				this.pitch = MathUtils.lerp(MathUtils.toRad(Config.MaxCameraPitch), MathUtils.toRad(45), tSmooth);

				break;
			}
		}

		if (t >= 1) {
			this.slippyMapOverlayFactor = 0;
			this.isInTransition = false;

			if (this.transitionType === TransitionType.ToSlippy) {
				this.switchToSlippy = true;
			}
		}
	}

	public update(deltaTime: number): void {
		this.clampPitchAndYaw();
		this.direction = Vec3.normalize(MathUtils.polarToCartesian(this.yaw, -this.pitch));

		this.processMovementByKeys(deltaTime);
		this.updateDistance(deltaTime);
		this.updateTargetHeightFromHeightmap();

		this.doTransition();

		const cameraOffset = Vec3.multiplyScalar(this.direction, -this.distance);
		const cameraPosition = Vec3.add(this.target, cameraOffset);

		this.camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
		this.camera.lookAt(this.target, false);

		if (this.lastLMBMoveEvent && this.LMBDownPosition) {
			this.camera.updateMatrixWorld();

			const positionOnGround = this.projectOnGround(this.lastLMBMoveEvent.x, this.lastLMBMoveEvent.y);
			const movementDelta = Vec2.sub(this.LMBDownPosition, positionOnGround);

			this.moveTarget(movementDelta.x, movementDelta.y);

			const cameraOffset = Vec3.multiplyScalar(this.direction, -this.distance);
			const cameraPosition = Vec3.add(this.target, cameraOffset);

			this.camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
			this.camera.lookAt(this.target, false);
		}

		this.camera.updateMatrixWorld();
		this.camera.updateMatrixWorldInverse();
	}
}