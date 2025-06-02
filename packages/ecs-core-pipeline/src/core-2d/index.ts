import type { Option } from 'joshkaposh-option';
import { Plugin } from 'ecs-app';
import { defineResource, defineSystem, set } from 'define';
import { Camera2d } from './camera-2d';
import { Entity, Query, QueryBuilder, With } from 'ecs';
import { entry } from 'ecs/src/util';

//! import
interface PhaseItem {
    get entity(): Entity;
    get main_entity(): MainEntity;
    get draw_function(): DrawFunctionId;
    get batch_range_start(): number;
    get batch_range_end(): number;
    get extra_index(): PhaseItemExtraIndex;
}

//! import
type BinnedPhaseItem<BatchSetKey extends any, BinKey extends any> =
    new (
        batch_set_key: BatchSetKey,
        bin_key: BinKey,
        representative_entity: [Entity, MainEntity],
        batch_range_start: number,
        batch_range_end: number,
        extra_index: PhaseItemExtraIndex
    ) => any;


const DrawFunctions = {
    Opaque2d: defineResource(class Opaque2d { }),
    AlphaMask2d: defineResource(class AlphaMask2d { }),
    Transparent2d: defineResource(class Transparent2d { }),
} as const;

export type Node2d = typeof Node2d[keyof typeof Node2d];
export const Node2d = {
    MsaaWriteback: 0,
    StartMainPass: 1,
    MainOpaquePass: 2,
    MainTransparentPass: 3,
    EndMainPass: 4,
    Wireframe: 5,
    PostProcessing: 6,
    Tonemapping: 7,
    Fxaa: 8,
    Upscaling: 9,
    ContrastAdaptiveSharpening: 10,
    EndMainPassPostProcessing: 11
} as const;

export const Core2dPlugin = Plugin({
    name: 'Core2dPlugin',
    build(app) {
        app
            .registerType(Camera2d)
            .addPlugins(ExtractComponentPlugin.Camera2d.default());

        const render_app = app.getSubApp(RenderApp);
        if (!render_app) {
            return
        }

        render_app
            .initResource(DrawFunctions.Opaque2d)
            .initResource(DrawFunctions.AlphaMask2d)
            .initResource(DrawFunctions.Transparent2d)
            .initResource(ViewSortedRenderPhases.Transparent2d)
            .initResource(ViewBinnedRenderPhases.Opaque2d)
            .initResource(ViewBinnedRenderPhases.AlphaMask2d)
            .addSystems(ExtractSchedule, extract_core_2d_camera_phases)
            .addSystems(Render, set(sort_phase_system.Transparent2d.inSet(RenderSystems.PhaseSort), prepare_core_2d_depth_textures.inSet(RenderSystems.PrepareResources)))

        render_app
            .addRenderSubGraph(Core2d)
            .addRenderGraphNode(EmptyNode, Core2d, Node2d.StartMainPass)
            .addRenderGraphNode(ViewMpdeRunner.MainOpaquePass2dMode, Core2d, Node2d.MainOpaquePass)
            .addRenderGraphNode(ViewNodeRunnder.MainTransparentPass2dNode, Core2d, Node2d.MainTransparentPass)
            .addRenderGraphNode(EmptyNode, Core2d, Node2d.EndMainPass)
            .addRenderGraphNode(ViewNodeRunnder.TonemappingNode, Core2d, Node2d.Tonemapping)
            .addRenderGraphNode(EmptyNode, Core2d, Node2d.EndMainPassPostProcessing)
            .addRenderGraphNode(ViewNodeRunnder.UpscalingMode, Core2d, Node2d.Upscaling)
            .addRenderGraphEdges(Core2d, [
                Node2d.StartMainPass,
                Node2d.MainOpaquePass,
                Node2d.MainTransparentPass,
                Node2d.EndMainPass,
                Node2d.Tonemapping,
                Node2d.EndMainPassPostProcessing,
                Node2d.Upscaling
            ])
    }
});

export class Opaque2d implements PhaseItem {
    batch_set_key: BatchSetKey2d;
    bin_key: Opaque2dBinKey;
    representative_entity: [Entity, MainEntity];
    batch_range_start: number;
    batch_range_end: number;
    extra_index: PhaseItemExtraIndex;

    // batch_set_key: BatchSetKey,
    // bin_key: BinKey,
    // representative_entity: [Entity, MainEntity],
    // batch_range_start: number,
    // batch_range_end: number,
    // extra_index: PhaseItemExtraIndex


    constructor(
        batch_set_key: BatchSetKey2d,
        bin_key: Opaque2dBinKey,
        representative_entity: [Entity, MainEntity],
        batch_range_start: number,
        batch_range_end: number,
        extra_index: PhaseItemExtraIndex
    ) {
        this.batch_set_key = batch_set_key;
        this.bin_key = bin_key;
        this.representative_entity = representative_entity;
        this.batch_range_start = batch_range_start;
        this.batch_range_end = batch_range_end;
        this.extra_index = extra_index;
    }

    get entity() {
        return this.representative_entity[0];
    }

    get main_entity() {
        return this.representative_entity[1];
    }

    get draw_function(): number {
        return this.bin_key.draw_function;
    }


}

type CachedRenderPipelineId = number;
type DrawFunctionId = number;
type UntypedAssetId = number;
type BindGroupId = number;

interface PhaseItemBatchSetKey {
    get indexed(): boolean;
}

interface CachedRenderPipelinePhaseItem {
    get cached_pipeline(): CachedRenderPipelineId;
}

export class BatchSetKey2d implements PhaseItemBatchSetKey {
    indexed: boolean;
    constructor(indexed: boolean) {
        this.indexed = indexed;
    }
}

// export class Key2d implements PhaseItemBatchSetKey {
//     pipeline: CachedRenderPipelineId;
//     draw_function: DrawFunctionId;
//     asset_id: UntypedAssetId;
//     material_bind_group_id: Option<BindGroupId>;

//     constructor(
//         pipeline: CachedRenderPipelineId,
//         draw_function: DrawFunctionId,
//         asset_id: UntypedAssetId,
//         material_bind_group_id: Option<BindGroupId>
//     ) {
//         this.pipeline = pipeline;
//         this.draw_function = draw_function;
//         this.asset_id = asset_id;
//         this.material_bind_group_id = material_bind_group_id;
//     }

//     get indexed(): boolean {

//     }
// }

export class Opaque2dBinKey {
    pipeline: CachedRenderPipelineId;
    draw_function: DrawFunctionId;
    asset_id: UntypedAssetId;
    material_bind_group_id: Option<BindGroupId>;

    constructor(
        pipeline: CachedRenderPipelineId,
        draw_function: DrawFunctionId,
        asset_id: UntypedAssetId,
        material_bind_group_id: Option<BindGroupId>
    ) {
        this.pipeline = pipeline;
        this.draw_function = draw_function;
        this.asset_id = asset_id;
        this.material_bind_group_id = material_bind_group_id;
    }
}

export class AlphaMask2d implements PhaseItem, CachedRenderPipelinePhaseItem {
    batch_set_key: BatchSetKey2d;
    bin_key: AlphaMask2dBinKey;
    representative_entity: [Entity, MainEntity];
    batch_range_start: number;
    batch_range_end: number;
    extra_index: PhaseItemExtraIndex;

    constructor(
        batch_set_key: BatchSetKey2d,
        bin_key: AlphaMask2dBinKey,
        representative_entity: [Entity, MainEntity],
        batch_range_start: number,
        batch_range_end: number,
        extra_index: PhaseItemExtraIndex,
    ) {
        this.batch_set_key = batch_set_key;
        this.bin_key = bin_key;
        this.representative_entity = representative_entity;
        this.batch_range_start = batch_range_start;
        this.batch_range_end = batch_range_end;
        this.extra_index = extra_index;
    }

    get entity(): number {
        return this.representative_entity[0];
    }

    get main_entity(): any {
        return this.representative_entity[1];
    }

    get draw_function(): number {
        return this.bin_key.draw_function;
    }

    get cached_pipeline(): number {
        return this.bin_key.pipeline;
    }
}


export class AlphaMask2dBinKey {
    pipeline: CachedRenderPipelineId;
    draw_function: DrawFunctionId;
    asset_id: UntypedAssetId;
    material_bind_group_id: Option<BindGroupId>;

    constructor(
        pipeline: CachedRenderPipelineId,
        draw_function: DrawFunctionId,
        asset_id: UntypedAssetId,
        material_bind_group_id: Option<BindGroupId>
    ) {
        this.pipeline = pipeline;
        this.draw_function = draw_function;
        this.asset_id = asset_id;
        this.material_bind_group_id = material_bind_group_id;
    }
}

type FloatOrd = any;
type MainEntity = any;
type PhaseItemExtraIndex = any;

interface SortedPhaseItem<SortKey extends any> {
    get sort_key(): SortKey;

    sort(items: SortedPhaseItem<SortKey>[]): void;

    get indexed(): boolean;
}

export class Transparent2d implements PhaseItem, SortedPhaseItem<FloatOrd>, CachedRenderPipelinePhaseItem {
    sort_key: FloatOrd;
    representative_entity: [Entity, MainEntity];
    pipeline: CachedRenderPipelineId;
    draw_function: DrawFunctionId;
    batch_range_start: number;
    batch_range_end: number;
    extracted_index: number;
    extra_index: PhaseItemExtraIndex;
    indexed: boolean;

    constructor(
        sort_key: FloatOrd,
        representative_entity: [Entity, MainEntity],
        pipeline: CachedRenderPipelineId,
        draw_function: DrawFunctionId,
        batch_range_start: number,
        batch_range_end: number,
        extracted_index: number,
        extra_index: PhaseItemExtraIndex,
        indexed: boolean
    ) {
        this.sort_key = sort_key;
        this.representative_entity = representative_entity;
        this.pipeline = pipeline;
        this.draw_function = draw_function;
        this.batch_range_start = batch_range_start;
        this.batch_range_end = batch_range_end;
        this.extracted_index = extracted_index;
        this.extra_index = extra_index;
        this.indexed = indexed;
    }


    get entity() {
        return this.representative_entity[0]
    }

    get main_entity() {
        return this.representative_entity[1];
    }

    sort(_items: SortedPhaseItem<FloatOrd>[]): void {
        // radsort is a stable radix sort that peformed better than `Array.sort`.
        // radsort.sort_by_key(items, item => item.sort_key()[0])
    }

    get cached_pipeline(): number {
        return this.pipeline;
    }
}

type RetainedViewEntity = any;

const ViewSortedRenderPhases = {
    Transparent2d: defineResource(class Transparent2d { }),
} as const;

const ViewBinnedRenderPhases = {
    Opaque2d: defineResource(class Opaque2d { }),
    AlphaMask2d: defineResource(class AlphaMask2d { }),
} as const;

function Extract<const D extends any[], const F extends any[]>(data: D, filter: F) {
    return undefined as unknown as typeof Query<D, F>;
}


export const extract_core_2d_camera_phases = defineSystem(b => b
    .resMut(ViewSortedRenderPhases.Transparent2d)
    .resMut(ViewBinnedRenderPhases.Opaque2d)
    .resMut(ViewBinnedRenderPhases.AlphaMask2d)
    // .custom(Extract<Query<(Entity, Camera), With<Camera2d>>>)
    .custom(Extract([Entity, Camera], [With(Camera2d)]))
    .local(new Set<RetainedViewEntity>()),
    function extract_core_2d_camera_phases(
        transparent_2d_phases,
        opaque_2d_phases,
        alpha_mask_2d_phases,
        cameras_2d,
        live_entities
    ) {

        live_entities.value.clear();

        for (const [main_entity, camera] of cameras_2d) {
            if (!camera.is_active) {
                continue;
            }

            const retained_view_entity = new RetainedViewEntity(main_entity.into(), null, 0);

            transparent_2d_phases.v.insertOrClear(retained_view_entity);
            opaque_2d_phases.v.prepareForNewFrame(retained_view_entity, GpuPreprocessingMode.None);
            alpha_mask_2d_phases.v.prepareForNewFrame(retained_view_entity, GpuPreprocessingMode.None);
            live_entities.value.add(retained_view_entity);
        }

        const live_entities_ = live_entities.value;
        transparent_2d_phases.v.retain(camera_entity => live_entities_.has(camera_entity));
        opaque_2d_phases.v.retain(camera_entity => live_entities_.has(camera_entity));
        alpha_mask_2d_phases.v.retain(camera_entity => live_entities_.has(camera_entity));

    });

export const prepare_core_2d_depth_textures = defineSystem(b => b
    .commands()
    .resMut(TextureCache)
    .res(RenderDevice)
    .res(ViewSortedRenderPhases.Transparent2d)
    .res(ViewBinnedRenderPhases.Opaque2d)
    .queryFiltered([Entity, ExtractedCamera, ExtractedView, Msaa], [With(Camera2d)]),
    function prepare_core_2d_depth_textures(
        commands,
        texture_cache,
        render_device,
        transparent_2d_phases,
        opaque_2d_phases,
        views_2d
    ) {
        const textures = new Map();
        for (const [view, camera, extracted_view, msaa] of views_2d) {
            if (
                !opaque_2d_phases.v.has(extracted_view.retained_view_entity)
                || !transparent_2d_phases.v.has(extracted_view.retained_view_entity)
            ) {
                continue
            }

            const physical_target_size = camera.physical_target_size;
            if (!physical_target_size) {
                continue;
            }

            const cached_texture = entry(textures, camera.target, () => {
                const size = {
                    depth_or_array_layers: 1,
                    width: physical_target_size.x,
                    height: physical_target_size.y
                }

                const descriptor = {
                    label: 'view_depth_texture',
                    size,
                    mip_level_count: 1,
                    sample_count: msaa.samples(),
                    dimension: TextureDimension.D2,
                    format: CORE_2D_DEPTH_FORMAT,
                    usage: TextureUsages.RENDER_ATTACHMENT,
                    view_formats: []
                };

                return texture_cache.v.get(render_device, descriptor);
            });

            commands.entity(view).insert(ViewDepthTexture.new(cached_texture, 0))
        }
    })