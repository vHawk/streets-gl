import TileSource from "./TileSource";
import AbstractTexture2D from "~/lib/renderer/abstract-renderer/AbstractTexture2D";
import {RendererTypes} from "~/lib/renderer/RendererTypes";
import AbstractRenderer from "~/lib/renderer/abstract-renderer/AbstractRenderer";
import TerrainHeightLoader, {HeightLoaderTile} from "~/app/terrain/TerrainHeightLoader";
import Utils from "~/app/Utils";
import Config from "~/app/Config";
import EsriElevationFetcher from "~/app/terrain/EsriElevationFetcher";

export default class HeightTileSource extends TileSource<Float32Array> {
	private texture: AbstractTexture2D = null;
	private heightLoaderTile: HeightLoaderTile = null;

	public constructor(x: number, y: number, zoom: number) {
		super(x, y, zoom);
	}

	public async loadFromHeightLoader(heightLoader: TerrainHeightLoader, level: number): Promise<void> {
		const tile = await heightLoader.getOrLoadTile(this.x, this.y, this.zoom, this);

		if (this.deleted) {
			this.heightLoaderTile.tracker.release(this);
			return;
		}

		this.heightLoaderTile = tile;
		this.data = tile.getLevel(level).data;
	}

	public async load(): Promise<void> {
		const source = await EsriElevationFetcher.fetch(this.x, this.y, this.zoom);

		if (this.deleted) {
			return;
		}

		this.data = source;
	}

	public getTexture(renderer: AbstractRenderer): AbstractTexture2D {
		if (!this.data) {
			throw new Error();
		}

		if (!this.texture) {
			this.texture = renderer.createTexture2D({
				width: 512,
				height: 512,
				format: RendererTypes.TextureFormat.R32Float,
				mipmaps: false,
				data: this.data
			});
		}

		return this.texture;
	}

	public delete(): void {
		this.deleted = true;

		if (this.heightLoaderTile) {
			this.heightLoaderTile.tracker.release(this);
		}

		if (this.texture) {
			this.texture.delete();
		}
	}
}