import AbstractQualifierFactory from "~/lib/tile-processing/vector/qualifiers/factories/AbstractQualifierFactory";
import {VectorNodeDescriptor} from "~/lib/tile-processing/vector/qualifiers/descriptors";
import {Qualifier, QualifierType} from "~/lib/tile-processing/vector/qualifiers/Qualifier";
import isUnderground from "~/lib/tile-processing/vector/qualifiers/factories/osm/helpers/isUnderground";
import {ModifierType} from "~/lib/tile-processing/vector/qualifiers/modifiers";
import {
	isTagIncludesString,
	parseDirection,
	parseHeight
} from "~/lib/tile-processing/vector/qualifiers/factories/osm/helpers/tagHelpers";
import getTreeTypeFromTags from "~/lib/tile-processing/vector/qualifiers/factories/osm/helpers/getTreeTypeFromTags";
import getTreeHeight from "./helpers/getTreeHeight";

export default class OSMNodeQualifierFactory extends AbstractQualifierFactory<VectorNodeDescriptor, Record<string, string>> {
	public fromTags(tags: Record<string, string>): Qualifier<VectorNodeDescriptor>[] {
		if (isUnderground(tags)) {
			return null;
		}

		if (tags.natural === 'tree') {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'tree',
					height: getTreeHeight(tags),
					treeType: getTreeTypeFromTags(tags)
				}
			}];
		}

		if (
			tags.emergency === 'fire_hydrant' && (
				tags['fire_hydrant:type'] === 'pillar' || tags['fire_hydrant:type'] === undefined
			)
		) {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'hydrant'
				}
			}];
		}

		if (tags.advertising === 'column') {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'adColumn'
				}
			}];
		}

		if (tags.power === 'tower') {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'transmissionTower'
				}
			}];
		}

		if (tags.power === 'pole') {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'utilityPole'
				}
			}];
		}

		if (tags.natural === 'rock') {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'rock'
				}
			}];
		}

		if (tags.amenity === 'bench') {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'bench',
					direction: parseDirection(tags.direction, undefined)
				}
			}];
		}

		if (tags.leisure === 'picnic_table') {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'picnicTable'
				}
			}];
		}

		if (tags.highway === 'bus_stop' && !(tags['public_transport'] === 'stop_position')) {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'busStop'
				}
			}];
		}

		if (tags.power === 'generator' && tags['generator:source'] === 'wind') {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'windTurbine',
					height: parseHeight(tags.height, 150)
				}
			}];
		}

		if (
			tags.historic === 'memorial' && isTagIncludesString(tags, 'memorial', 'statue') ||
			tags.tourism === 'artwork' && isTagIncludesString(tags, 'artwork_type', 'statue')
		) {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'statue'
				}
			}];
		}

		if (
			tags.tourism === 'artwork' && isTagIncludesString(tags, 'artwork_type', 'sculpture') ||
			tags.historic === 'memorial' && isTagIncludesString(tags, 'memorial', 'sculpture')
		) {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'sculpture'
				}
			}];
		}

		if (
			tags.historic === 'memorial' && (
				isTagIncludesString(tags, 'memorial', 'war_memorial') ||
				isTagIncludesString(tags, 'memorial', 'stele') ||
				isTagIncludesString(tags, 'memorial', 'obelisk') ||
				isTagIncludesString(tags, 'memorial', 'memorial')
			)
		) {
			return [{
				type: QualifierType.Descriptor,
				data: {
					type: 'memorial'
				}
			}];
		}

		if (tags.highway === 'turning_circle') {
			return [{
				type: QualifierType.Modifier,
				data: {
					type: ModifierType.CircleArea,
					radius: 10,
					descriptor: {
						type: 'roadwayIntersection',
						intersectionMaterial: 'asphalt'
					}
				}
			}];
		}

		if (tags.aeroway === 'helipad') {
			return [{
				type: QualifierType.Modifier,
				data: {
					type: ModifierType.CircleArea,
					radius: 8,
					descriptor: {
						type: 'helipad'
					}
				}
			}];
		}

		return null;
	}
}