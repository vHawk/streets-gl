import {VectorTile} from "~/lib/tile-processing/vector/providers/pbf/VectorTile";
import {VectorAreaDescriptor} from "~/lib/tile-processing/vector/qualifiers/descriptors";
import getRoofParams from "~/lib/tile-processing/vector/qualifiers/factories/vector-tile/helpers/getRoofParams";
import getRoofOrientation
	from "~/lib/tile-processing/vector/qualifiers/factories/vector-tile/helpers/getRoofOrientation";
import isBuildingHasWindows
	from "~/lib/tile-processing/vector/qualifiers/factories/vector-tile/helpers/isBuildingHasWindows";
import getFacadeParamsFromTags
	from "~/lib/tile-processing/vector/qualifiers/factories/vector-tile/helpers/getFacadeParams";

export default function getBuildingParams(
	tags: VectorTile.FeatureTags
): {
	label: string;
	buildingLevels: number;
	buildingHeight: number;
	buildingMinHeight: number;
	buildingRoofHeight: number;
	buildingRoofType: VectorAreaDescriptor['buildingRoofType'];
	buildingRoofOrientation: VectorAreaDescriptor['buildingRoofOrientation'];
	buildingRoofDirection: number;
	buildingRoofAngle: number;
	buildingFacadeMaterial: VectorAreaDescriptor['buildingFacadeMaterial'];
	buildingFacadeColor: number;
	buildingRoofMaterial: VectorAreaDescriptor['buildingRoofMaterial'];
	buildingRoofColor: number;
	buildingWindows: boolean;
	buildingFoundation: boolean;
} {
	const fallbackLevels = 1;
	const levelHeight = 4;

	const isRoof = tags.buildingType === 'roof';

	const hasFoundation = !isRoof &&
		tags.levels === undefined &&
		tags.minLevel === undefined &&
		tags.height === undefined &&
		tags.minHeight === undefined;

	const roofParams = getRoofParams(tags);
	const roofOrientation = getRoofOrientation(<string>tags['roofOrientation']);
	const roofLevels = <number>tags.roofLevels <= 0 ? 0.6 : <number>tags.roofLevels ?? (roofParams.type === 'flat' ? 0 : 1);
	const roofDirection = <number>tags.roofDirection ?? null;
	const roofAngle = <number>tags.roofAngle ?? null;
	let roofHeight = <number>tags.roofHeight ?? (roofLevels * levelHeight);

	let minLevel = <number>tags.minLevel ?? null;
	let height = <number>tags.height ?? null;
	let levels = <number>tags.levels ?? null;
	let minHeight = <number>tags.minHeight ?? null;

	if (height !== null) {
		roofHeight = Math.min(roofHeight, height - (minHeight ?? 0));
	}

	if (height === null && levels === null) {
		levels = (minLevel !== null) ? minLevel : fallbackLevels;
		height = levels * levelHeight + roofHeight
	} else if (height === null) {
		height = levels * levelHeight + roofHeight
	} else if (levels === null) {
		levels = Math.max(1, Math.round((height - roofHeight) / levelHeight));
	}

	if (minLevel === null) {
		if (minHeight !== null) {
			minLevel = Math.min(levels - 1, Math.round(minHeight / levelHeight));
		} else {
			minLevel = 0;
		}
	}

	if (minHeight === null) {
		minHeight = Math.min(minLevel * levelHeight, height);
	}

	const facadeParams = getFacadeParamsFromTags(tags);
	const label = <string>tags.name ?? null;

	let windows = isBuildingHasWindows(tags);
	if (height - minHeight - roofHeight < 2) {
		windows = false;
	}

	return {
		label: label,
		buildingLevels: levels - minLevel,
		buildingHeight: height,
		buildingMinHeight: isRoof ? (height - roofHeight) : minHeight,
		buildingRoofHeight: roofHeight,
		buildingRoofType: roofParams.type,
		buildingRoofOrientation: roofOrientation,
		buildingRoofDirection: roofDirection,
		buildingRoofAngle: roofAngle,
		buildingFacadeMaterial: facadeParams.material,
		buildingFacadeColor: facadeParams.color,
		buildingRoofMaterial: roofParams.material,
		buildingRoofColor: roofParams.color,
		buildingWindows: windows,
		buildingFoundation: hasFoundation
	};
}
