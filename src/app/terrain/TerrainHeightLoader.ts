import TerrainHeightLoaderBitmap from "~/app/terrain/TerrainHeightLoaderBitmap";
import Utils from "~/app/Utils";
import Config from "~/app/Config";

type AnyObject = any;

export class UsageTracker {
	private users: Set<AnyObject> = new Set();

	public use(id: AnyObject): void {
		this.users.add(id);
	}

	public release(id: AnyObject): void {
		this.users.delete(id);
	}

	public isUsed(): boolean {
		return this.users.size > 0;
	}
}

export class HeightLoaderTile {
	public tracker: UsageTracker = new UsageTracker();
	public levels: Map<number, TerrainHeightLoaderBitmap> = new Map();

	public setLevel(levelId: number, bitmap: TerrainHeightLoaderBitmap): void {
		this.levels.set(levelId, bitmap);
	}

	public getLevel(levelId: number): TerrainHeightLoaderBitmap {
		return this.levels.get(levelId);
	}

	public delete(): void {
		for (const level of this.levels.values()) {
			level.delete();
		}
	}
}

interface Request {
	x: number;
	y: number;
	zoom: number;
	waitingList: {resolve: () => void}[];
}

class RequestQueue {
	private readonly queue: Request[] = [];
	private readonly queueInProgress: Request[] = [];

	public add(request: Request): void {
		this.queue.push(request);
	}

	public get(): Request | undefined {
		const request = this.queue.shift();

		if (request) {
			this.queueInProgress.push(request);
		}

		return request;
	}

	public remove(request: Request): void {
		const index = this.queueInProgress.indexOf(request);

		if (index !== -1) {
			this.queueInProgress.splice(index, 1);
		}
	}

	public find(x: number, y: number, zoom: number): Request | undefined {
		const queueResult = this.queue.find((request) => request.x === x && request.y === y && request.zoom === zoom);

		if (queueResult) {
			return queueResult;
		}

		return this.queueInProgress.find((request) => request.x === x && request.y === y && request.zoom === zoom);
	}

	public get size(): number {
		return this.queue.length;
	}
}

export default class TerrainHeightLoader {
	private readonly tiles: Map<string, HeightLoaderTile> = new Map();
	private readonly maxConcurrentRequests: number = 2;
	private readonly activeRequests: Set<Request> = new Set();
	private readonly queue: RequestQueue = new RequestQueue();
	private readonly decodingCanvas: HTMLCanvasElement;
	private readonly decodingCtx: CanvasRenderingContext2D;

	public constructor() {
		this.decodingCanvas = document.createElement('canvas');
		this.decodingCtx = this.decodingCanvas.getContext('2d', {willReadFrequently:true});
	}

	public async getOrLoadTile(
		x: number,
		y: number,
		zoom: number,
		owner: AnyObject
	): Promise<HeightLoaderTile> {
		const tile = this.getTile(x, y, zoom);

		if (tile) {
			tile.tracker.use(owner);

			return Promise.resolve(tile);
		}

		return new Promise((resolve) => {
			const waitingListItem = {
				resolve: (): void => {
					const tile = this.getTile(x, y, zoom);

					tile.tracker.use(owner);
					resolve(tile);
				}
			};
			const request = this.queue.find(x, y, zoom);

			if (request) {
				request.waitingList.push(waitingListItem);
				return;
			}

			const newRequest: Request = {
				x,
				y,
				zoom,
				waitingList: [waitingListItem]
			};

			this.queue.add(newRequest);
		});
	}

	private processQueue(): void {
		while (this.queue.size > 0 && this.activeRequests.size < this.maxConcurrentRequests) {
			const task = this.queue.get();

			this.activeRequests.add(task);

			this.load(task.x, task.y, task.zoom, 1).then(() => {
				this.activeRequests.delete(task);
				this.queue.remove(task);

				for (const waitingListItem of task.waitingList) {
					waitingListItem.resolve();
				}
			});
		}
	}

	public update(): void {
		this.removeUnusedTiles();
		this.processQueue();
	}

	private async load(
		x: number,
		y: number,
		zoom: number,
		downscaleTimes: number
	): Promise<void> {
		const url = TerrainHeightLoader.getURL(x, y, zoom);
		const response = await fetch(url, {
			method: 'GET'
		});

		if (response.status !== 200) {
			return;
		}

		const blob = await response.blob();
		const bitmap = await createImageBitmap(blob);
		const decoded = this.decodeBitmap(bitmap);

		this.addBitmap(decoded, x, y, zoom, 0);

		for (let i = 0; i < downscaleTimes; i++) {
			const tx = Math.floor(x / (2 ** i));
			const ty = Math.floor(y / (2 ** i));

			const downscaled = decoded.downscale();
			this.addBitmap(downscaled, tx, ty, zoom, i + 1);
		}

		//this.getTile(x, y, zoom).tracker.use(owner);
	}

	private removeUnusedTiles(): void {
		for (const [key, tile] of this.tiles.entries()) {
			if (!tile.tracker.isUsed()) {
				tile.delete();
				this.tiles.delete(key);
			}
		}
	}

	public getTile(x: number, y: number, zoom: number): HeightLoaderTile {
		const key = `${x},${y},${zoom}`;
		const tile = this.tiles.get(key);

		if (tile) {
			return tile;
		}

		return null;
	}

	private addTile(x: number, y: number, zoom: number): HeightLoaderTile {
		const key = `${x},${y},${zoom}`;
		const tile = new HeightLoaderTile();

		this.tiles.set(key, tile);

		return tile;
	}

	private addBitmap(bitmap: TerrainHeightLoaderBitmap, x: number, y: number, zoom: number, level: number): void {
		let tile = this.getTile(x, y, zoom);

		if (!tile) {
			tile = this.addTile(x, y, zoom);
		}

		tile.setLevel(level, bitmap);
	}

	public getBitmap(x: number, y: number, zoom: number, level: number): TerrainHeightLoaderBitmap {
		const tile = this.getTile(x, y, zoom);

		if (!tile) {
			return null;
		}

		return tile.getLevel(level);
	}

	private decodeBitmap(bitmap: ImageBitmap): TerrainHeightLoaderBitmap {
		this.decodingCanvas.width = bitmap.width;
		this.decodingCanvas.height = bitmap.height;

		this.decodingCtx.drawImage(bitmap, 0, 0);

		const imageData = this.decodingCtx.getImageData(0, 0, bitmap.width, bitmap.height);
		const data = new Float32Array(bitmap.width * bitmap.height);

		for (let i = 0; i < data.length; i++) {
			const r = imageData.data[i * 4];
			const g = imageData.data[i * 4 + 1];
			const b = imageData.data[i * 4 + 2];

			data[i] = -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
		}

		return new TerrainHeightLoaderBitmap(bitmap, data, bitmap.width, bitmap.height);
	}

	private static getURL(x: number, y: number, zoom: number): string {
		return Utils.resolveEndpointTemplate({
			template: Config.ElevationEndpointTemplate,
			values: {
				x: x,
				y: y,
				z: zoom
			}
		});
	}

	private static getTileKey(x: number, y: number, zoom: number): string {
		return `${x},${y},${zoom}`;
	}
}
