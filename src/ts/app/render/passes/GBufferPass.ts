import * as RG from "~/render-graph";
import AbstractMaterial from "~/renderer/abstract-renderer/AbstractMaterial";
import AbstractRenderer from "../../../renderer/abstract-renderer/AbstractRenderer";
import {RendererTypes} from "../../../renderer/RendererTypes";
import {UniformMatrix4} from "../../../renderer/abstract-renderer/Uniform";
import FullScreenTriangle from "../../objects/FullScreenTriangle";
import Tile from "~/app/objects/Tile";
import PerspectiveCamera from "../../../core/PerspectiveCamera";
import Mat4 from "../../../math/Mat4";
import AbstractRenderPass from "../../../renderer/abstract-renderer/AbstractRenderPass";
import Skybox from "../../objects/Skybox";
import Shaders from "../Shaders";
import AbstractTexture2D from "../../../renderer/abstract-renderer/AbstractTexture2D";

export default class GBufferPass extends RG.Pass {
	private readonly renderer: AbstractRenderer;
	private material: AbstractMaterial;
	private material2: AbstractMaterial;
	private materialSkybox: AbstractMaterial;
	private fullScreenTriangle: FullScreenTriangle;
	private tilesMap: Map<string, Tile>;
	private camera: PerspectiveCamera;
	private skybox: Skybox;
	private backBufferRenderPass: AbstractRenderPass;
	private testRenderPass: AbstractRenderPass;

	constructor(renderer: AbstractRenderer) {
		super('GBufferPass');

		this.renderer = renderer;

		this.init();
	}

	public setTilesMap(tilesMap: Map<string, Tile>) {
		this.tilesMap = tilesMap;
	}

	public setCamera(camera: PerspectiveCamera) {
		this.camera = camera;
	}

	public setSkybox(skybox: Skybox) {
		this.skybox = skybox;
	}

	private init() {
		this.fullScreenTriangle = new FullScreenTriangle(this.renderer);

		const testColorTex = this.renderer.createTexture2D({
			width: this.renderer.resolution.x,
			height: this.renderer.resolution.y,
			format: RendererTypes.TextureFormat.RGBA8Unorm,
			minFilter: RendererTypes.MinFilter.Nearest,
			magFilter: RendererTypes.MagFilter.Nearest,
			mipmaps: false
		});

		const testDepthTex = this.renderer.createTexture2D({
			width: this.renderer.resolution.x,
			height: this.renderer.resolution.y,
			format: RendererTypes.TextureFormat.Depth32Float,
			minFilter: RendererTypes.MinFilter.Nearest,
			magFilter: RendererTypes.MagFilter.Nearest,
			mipmaps: false
		})

		this.backBufferRenderPass = this.renderer.createRenderPass({
			colorAttachments: []
		});

		this.testRenderPass = this.renderer.createRenderPass({
			colorAttachments: [{
				texture: testColorTex,
				clearValue: {r: 0, g: 1, b: 1, a: 1},
				loadOp: RendererTypes.AttachmentLoadOp.Load,
				storeOp: RendererTypes.AttachmentStoreOp.Store
			}],
			depthAttachment: {
				texture: testDepthTex,
				clearValue: 1,
				loadOp: RendererTypes.AttachmentLoadOp.Clear,
				storeOp: RendererTypes.AttachmentStoreOp.Store
			}
		});

		this.createMaterials();
	}

	private createMaterials() {
		this.material = this.renderer.createMaterial({
			name: 'GBuffer material',
			uniforms: [
				{
					name: 'modelViewMatrix',
					block: 'PerMesh',
					type: RendererTypes.UniformType.Matrix4,
					value: new Float32Array(16)
				}, {
					name: 'projectionMatrix',
					block: 'PerMaterial',
					type: RendererTypes.UniformType.Matrix4,
					value: new Float32Array(16)
				}
			],
			primitive: {
				frontFace: RendererTypes.FrontFace.CCW,
				cullMode: RendererTypes.CullMode.Back
			},
			depth: {
				depthWrite: true,
				depthCompare: RendererTypes.DepthCompare.LessEqual
			},
			vertexShaderSource: Shaders.building.vertex,
			fragmentShaderSource: Shaders.building.fragment
		});

		this.material2 = this.renderer.createMaterial({
			name: 'Compose material',
			uniforms: [
				{
					name: 'map',
					block: null,
					type: RendererTypes.UniformType.Texture2D,
					value: <AbstractTexture2D>this.testRenderPass.colorAttachments[0].texture
				}
			],
			primitive: {
				frontFace: RendererTypes.FrontFace.CCW,
				cullMode: RendererTypes.CullMode.None
			},
			depth: {
				depthWrite: true,
				depthCompare: RendererTypes.DepthCompare.LessEqual
			},
			vertexShaderSource: Shaders.ldrCompose.vertex,
			fragmentShaderSource: Shaders.ldrCompose.fragment
		});

		this.materialSkybox = this.renderer.createMaterial({
			name: 'Skybox material',
			uniforms: [
				{
					name: 'modelViewMatrix',
					block: 'Uniforms',
					type: RendererTypes.UniformType.Matrix4,
					value: new Float32Array(16)
				}, {
					name: 'projectionMatrix',
					block: 'Uniforms',
					type: RendererTypes.UniformType.Matrix4,
					value: new Float32Array(16)
				}
			],
			primitive: {
				frontFace: RendererTypes.FrontFace.CCW,
				cullMode: RendererTypes.CullMode.Front
			},
			depth: {
				depthWrite: false,
				depthCompare: RendererTypes.DepthCompare.Always
			},
			vertexShaderSource: Shaders.skybox.vertex,
			fragmentShaderSource: Shaders.skybox.fragment
		});
	}

	public render() {
		for (const tile of this.tilesMap.values()) {
			if (!tile.buildingsMesh && tile.readyForRendering) {
				tile.createMeshes(this.renderer);
			}
		}

		this.renderer.beginRenderPass(this.testRenderPass);

		this.renderer.useMaterial(this.materialSkybox);

		this.materialSkybox.getUniform<UniformMatrix4>('projectionMatrix', 'Uniforms').value = new Float32Array(this.camera.projectionMatrix.values);
		this.materialSkybox.getUniform<UniformMatrix4>('modelViewMatrix', 'Uniforms').value = new Float32Array(Mat4.multiply(this.camera.matrixWorldInverse, this.skybox.matrixWorld).values);
		this.materialSkybox.applyUniformUpdates('projectionMatrix', 'Uniforms');
		this.materialSkybox.applyUniformUpdates('modelViewMatrix', 'Uniforms');

		this.skybox.draw();

		this.renderer.useMaterial(this.material);

		this.material.getUniform<UniformMatrix4>('projectionMatrix', 'PerMaterial').value = new Float32Array(this.camera.projectionMatrix.values);
		this.material.applyUniformUpdates('projectionMatrix', 'PerMaterial');

		for (const tile of this.tilesMap.values()) {
			if (!tile.buildingsMesh) {
				continue;
			}

			const mvMatrix = Mat4.multiply(this.camera.matrixWorldInverse, tile.matrixWorld);

			this.material.getUniform<UniformMatrix4>('modelViewMatrix', 'PerMesh').value = new Float32Array(mvMatrix.values);
			this.material.applyUniformUpdates('modelViewMatrix', 'PerMesh');

			tile.buildingsMesh.draw();
		}

		this.renderer.beginRenderPass(this.backBufferRenderPass);
		this.renderer.useMaterial(this.material2);

		this.fullScreenTriangle.mesh.draw();
	}
}