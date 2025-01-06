import Vec3 from "~/lib/math/Vec3";
import MathUtils from "~/lib/math/MathUtils";
import URLControlsStateHandler from "../controls/URLControlsStateHandler";
import Config from "../Config";
import System from "../System";
import SceneSystem from './SceneSystem';
import Easing from "~/lib/math/Easing";
import GroundControlsNavigator from "../controls/GroundControlsNavigator";
import ControlsNavigator from "../controls/ControlsNavigator";
import FreeControlsNavigator from "../controls/FreeControlsNavigator";
import CursorStyleSystem from "./CursorStyleSystem";
import PerspectiveCamera from "~/lib/core/PerspectiveCamera";
import TerrainSystem from "~/app/systems/TerrainSystem";
import SlippyControlsNavigator from "~/app/controls/SlippyControlsNavigator";

const WheelZoomFactor = 6;

export interface ControlsState {
	x: number;
	z: number;
	pitch: number;
	yaw: number;
	distance: number;
}

export enum NavigationMode {
	Ground,
	Free,
	Slippy
}

export default class ControlsSystem extends System {
	private readonly element: HTMLElement;
	public mode: NavigationMode = NavigationMode.Ground;
	public bikeMode: boolean = false;
	private switchBikeModeOnUpdate: boolean = false;
	private camera: PerspectiveCamera;
	private tick: number = 0;
	public target: Vec3 = new Vec3();
	private state: ControlsState;
	private urlHandler: URLControlsStateHandler = new URLControlsStateHandler();
	private wheelZoomScale: number = 0;
	private wheelZoomScaleTarget: number = 0;

	private groundNavigator: GroundControlsNavigator;
	private freeNavigator: FreeControlsNavigator;
	private slippyNavigator: SlippyControlsNavigator;
	private activeNavigator: ControlsNavigator = null;

	public constructor() {
		super();

		this.element = <HTMLCanvasElement>document.getElementById('canvas');

		this.element.addEventListener('contextmenu', (e: MouseEvent) => e.preventDefault());
		this.element.addEventListener('mousedown', (e: MouseEvent) => this.mouseDownEvent(e));
		this.element.addEventListener('mouseup', (e: MouseEvent) => this.mouseUpEvent(e));
		window.addEventListener('keydown', (e: KeyboardEvent) => this.keyDownEvent(e));
	}

	public postInit(): void {

	}

	public lookAtNorth(): void {
		if (this.activeNavigator) {
			this.activeNavigator.lookAtNorth();
		}
	}

	private initCameraAndNavigators(): void {
		this.camera = this.systemManager.getSystem(SceneSystem).objects.camera;

		const cursorStyleSystem = this.systemManager.getSystem(CursorStyleSystem);
		const terrainHeightProvider = this.systemManager.getSystem(TerrainSystem).terrainHeightProvider;

		this.groundNavigator = new GroundControlsNavigator(this.element, this.camera, cursorStyleSystem, terrainHeightProvider, this);
		this.freeNavigator = new FreeControlsNavigator(this.element, this.camera, terrainHeightProvider, this);
		this.slippyNavigator = new SlippyControlsNavigator(this.element, this.camera, cursorStyleSystem, terrainHeightProvider);

		this.activeNavigator = this.slippyNavigator;
		this.slippyNavigator.enable();
		this.slippyNavigator.syncWithCamera(null);
		this.mode = NavigationMode.Slippy;

		this.initStateFromHash();
	}

	private initStateFromHash(): void {
		const [newState] = this.urlHandler.getStateFromHash();

		if (newState) {
			this.state = newState;
			this.updatePositionFromState(this.state);
		} else {
			const {lat, lon, pitch, yaw, distance} = Config.StartPosition;
			const startPosition = MathUtils.degrees2meters(lat, lon);

			this.state = {
				x: startPosition.x,
				z: startPosition.y,
				pitch: MathUtils.toRad(pitch),
				yaw: MathUtils.toRad(yaw),
				distance: distance
			}

			this.updatePositionFromState(this.state);
		}
	}

	public getLatLon(): {lat: number; lon: number} {
		return MathUtils.meters2degrees(this.camera.position.x, this.camera.position.z);
	}

	public setLatLon(lat: number, lon: number): void {
		const position = MathUtils.degrees2meters(lat, lon);

		this.state.x = position.x;
		this.state.z = position.y;
		this.state.distance = 1500;
		this.state.pitch = MathUtils.toRad(45);
		this.state.yaw = MathUtils.toRad(0);

		this.updatePositionFromState(this.state);
	}

	public setState(lat: number, lon: number, pitch: number, yaw: number, distance: number): void {
		const position = MathUtils.degrees2meters(lat, lon);

		this.state.x = position.x;
		this.state.z = position.y;
		this.state.pitch = MathUtils.toRad(pitch);
		this.state.yaw = MathUtils.toRad(yaw);
		this.state.distance = distance;

		this.updatePositionFromState(this.state);
	}

	private updateStateFromPosition(): void {
		if (this.activeNavigator) {
			this.state = this.activeNavigator.getCurrentState();
		}
	}

	private updatePositionFromState(state: ControlsState): void {
		if (state.distance < Config.MaxCameraDistance && this.slippyNavigator.isEnabled) {
			this.slippyNavigator.disable();
			this.groundNavigator.enable();

			this.activeNavigator = this.groundNavigator;
			this.mode = NavigationMode.Ground;
		}

		if (state.distance > Config.MaxCameraDistance && this.groundNavigator.isEnabled) {
			this.groundNavigator.disable();
			this.slippyNavigator.enable();

			this.activeNavigator = this.slippyNavigator;
			this.mode = NavigationMode.Slippy;
		}

		if (this.activeNavigator) {
			this.activeNavigator.syncWithState(state);
		}
	}

	private keyDownEvent(e: KeyboardEvent): void {
		if (e.code === 'Tab') {
			e.preventDefault();

			if (this.mode === NavigationMode.Free) {
				this.mode = NavigationMode.Ground;
				this.activeNavigator = this.groundNavigator;
				this.freeNavigator.disable();
				this.groundNavigator.enable();
				this.groundNavigator.syncWithCamera(this.freeNavigator);
			} else if (this.mode === NavigationMode.Ground) {
				this.mode = NavigationMode.Free;
				this.activeNavigator = this.freeNavigator;
				this.groundNavigator.disable();
				this.freeNavigator.enable();
				this.freeNavigator.syncWithCamera(this.groundNavigator);
			}
		}
	}

	public switchBikeMode(): void {
		this.switchBikeModeOnUpdate = true;
	}

	private mouseDownEvent(e: MouseEvent): void {
		e.preventDefault();

		if (e.button === 1 && !this.slippyNavigator.isEnabled) {
			this.wheelZoomScaleTarget = 1;
		}
	}

	private mouseUpEvent(e: MouseEvent): void {
		if (e.button === 1) {
			this.wheelZoomScaleTarget = 0;
		}
	}

	private updateHash(): void {
		const [newState, changedByUser] = this.urlHandler.getStateFromHash();

		if (newState && changedByUser) {
			this.updatePositionFromState(newState);
			this.state = newState;
		} else {
			this.updateStateFromPosition();
		}

		if (this.tick % 30 === 0) {
			this.urlHandler.setHashFromState(this.state);
		}
	}

	public getCurrentStateHash(): string {
		return this.urlHandler.serializeControlsState(this.state);
	}

	public get isSlippyMapVisible(): boolean {
		return this.slippyNavigator.isEnabled || this.groundNavigator.slippyMapOverlayFactor > 0;
	}

	public get isTilesVisible(): boolean {
		return this.groundNavigator.isEnabled || this.freeNavigator.isEnabled;
	}

	public get slippyMapAndTilesFactor(): number {
		if (this.slippyNavigator.isEnabled) {
			return 1;
		}

		return this.groundNavigator.slippyMapOverlayFactor;
	}

	public get northDirection(): number {
		if (this.groundNavigator && this.groundNavigator.isEnabled) {
			return this.groundNavigator.yaw;
		}

		return 0;
	}

	public getGroundControlsTarget(): Vec3 {
		return this.groundNavigator.target;
	}

	public update(deltaTime: number): void {
		if (!this.camera) {
			this.initCameraAndNavigators();
		}

		this.activeNavigator.update(deltaTime);

		if (this.switchBikeModeOnUpdate) {
			this.switchBikeModeOnUpdate = false;

			this.bikeMode = !this.bikeMode;

			this.freeNavigator.setBikeMode(this.bikeMode);
			this.groundNavigator.setBikeMode(this.bikeMode);
	
			this.mode = NavigationMode.Free;
			this.activeNavigator = this.freeNavigator;
			this.groundNavigator.disable();
			this.freeNavigator.enable();
			this.freeNavigator.syncWithCamera(this.groundNavigator);
		}

		if (this.groundNavigator.switchToSlippy) {
			this.groundNavigator.switchToSlippy = false;

			this.groundNavigator.disable();
			this.slippyNavigator.enable();
			this.slippyNavigator.syncWithCamera(this.groundNavigator);

			this.activeNavigator = this.slippyNavigator;
			this.mode = NavigationMode.Slippy;

			this.activeNavigator.update(deltaTime);
		}

		if (this.slippyNavigator.switchToGround) {
			this.slippyNavigator.switchToGround = false;

			this.slippyNavigator.disable();
			this.groundNavigator.enable();
			this.groundNavigator.syncWithCamera(this.slippyNavigator);

			this.activeNavigator = this.groundNavigator;
			this.mode = NavigationMode.Ground;

			this.activeNavigator.update(deltaTime);
		}

		if (this.wheelZoomScaleTarget !== this.wheelZoomScale) {
			const sign = Math.sign(this.wheelZoomScaleTarget - this.wheelZoomScale);

			this.wheelZoomScale += sign * deltaTime * WheelZoomFactor;
			this.wheelZoomScale = MathUtils.clamp(this.wheelZoomScale, 0, 1);

			const alpha = Easing.easeOutCubic(this.wheelZoomScale);

			this.camera.zoom(MathUtils.lerp(1, Config.CameraFOVZoomFactor, alpha));
		}

		this.updateHash();

		++this.tick;
	}
}
