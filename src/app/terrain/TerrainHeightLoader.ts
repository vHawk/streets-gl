import TerrainHeightLoaderBitmap from "~/app/terrain/TerrainHeightLoaderBitmap";
import Utils from "~/app/Utils";
import Config from "~/app/Config";
import EsriElevationFetcher from "~/app/terrain/EsriElevationFetcher";

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
		const data = await EsriElevationFetcher.fetch(x, y, zoom);
		const decoded = new TerrainHeightLoaderBitmap(data, 512, 512);

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
}
