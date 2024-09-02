export default class TerrainHeightLoaderBitmap {
	public readonly data: Float32Array;
	private readonly width: number;
	private readonly height: number;

	public constructor(data: Float32Array, width: number, height: number) {
		this.data = data;
		this.width = width;
		this.height = height;
	}

	public fetchNearest(x: number, y: number): number {
		return this.data[y * this.width + x];
	}

	public downscale(): TerrainHeightLoaderBitmap {
		const width = this.width / 2;
		const height = this.height / 2;
		const data = new Float32Array(width * height);

		for (let x = 0; x < width; x++) {
			for (let y = 0; y < height; y++) {
				const x1 = x * 2;
				const y1 = y * 2;
				const x2 = x1 + 1;
				const y2 = y1 + 1;

				const a = this.fetchNearest(x1, y1);
				const b = this.fetchNearest(x2, y1);
				const c = this.fetchNearest(x1, y2);
				const d = this.fetchNearest(x2, y2);

				data[y * width + x] = (a + b + c + d) / 4;
			}
		}

		return new TerrainHeightLoaderBitmap(data, width, height);
	}
}