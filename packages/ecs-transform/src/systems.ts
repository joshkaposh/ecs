import { defineSystem } from "define";
import { Added, Changed, Entity, Maybe, mut, Or, ref, Without } from "ecs";

/**
 * Update [`GlobalTransform`] component of entities that aren't in the hierarchy
 * 
 * Third party plugins should ensure that this is used in concert with
 * [`propagate_parent_transforms`] and [`mark_dirty_trees`];
 */
export const sync_simple_transforms = defineSystem(b => b
    .paramSet(
        b.queryFiltered(
            [Transform, mut(GlobalTransform)],
            [Or(Changed(Transform), Added(GlobalTransform)), Without(ChildOf), Without(Children)]
        ),
        b.query([ref(Transform), mut(GlobalTransform)], [Without(ChildOf), Without(Children)])
    ).removedComponents(ChildOf), function sync_simple_transforms(query, orphaned) {
        // update changed entities
        query.p0().for_each(([transform, global_transform]) => global_transform.copyFrom(transform));

        // update orphaned entities
        query = query.p1();
        const it = query.iter_many_mut(orphaned.read());
        let n;
        while (!(n = it.fetch_next()).done) {
            const [transform, global_transform] = n;
            if (!transform.isChanged() && !global_transform.isAdded()) {
                global_transform.copyFrom(transform);
            }
        }
    });

/**
 * Optimization for static scenes. Propagates a "dirty bit" up the hierarchy towards ancestors.
 * Transform propagation can ignore entire subtrees of the hierarchy if it encounters an entity without the dirty bit.
 */
export const mark_dirty_trees = defineSystem((b) => b
    .queryFiltered(
        [Entity],
        [Or(
            Changed(Transform),
            Changed(ChildOf),
            Added(GlobalTransform)
        )
        ]
    ).removedComponent(ChildOf)
    .query(
        [Maybe(ChildOf),
        mut(TransformTreeChanged)]
    ), function mark_dirty_trees(changed_transforms, orphaned, transforms) {
        for (const entity of changed_transforms.iter().chain(orphaned.read())) {
            let next = entity;
            let tuple;
            while ((tuple = transforms.get_mut(next)) != null) {
                const [child_of, tree] = tuple;
                if (tree.is_changed() && !tree.is_added()) {
                    break;
                }

                tree.set_changed();
                const parent = child_of.map(ChildOf.parent);
                if (parent != null) {
                    next = parent;
                } else {
                    break;
                }
            }
        }
    })