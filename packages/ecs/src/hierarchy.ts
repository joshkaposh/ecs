import { Entity } from "./entity";
import { defineComponent } from "define";

// const ChildOf = import('@packages/define').then(module => module.defineComponent(class ChildOf {
//     parent: Entity;
//     constructor(parent: Entity) {
//         this.parent = parent;
//     }
// }));

// export const ChildOf = (await (import('define'))).defineComponent(class ChildOf {
//     parent: Entity;
//     constructor(parent: Entity) {
//         this.parent = parent;
//     }
// });


// ! tsconfig.json
// "include": [
//         "packages/ecs-util",
//         "packages/ecs",
//         "packages/ecs-app",
//         "packages/ecs-input",
//         "packages/ecs-math",
//         "packages/ecs-ui"
//     ],

//! tsconfig.common.json
// "paths": {
//             "@packages/ecs": [
//                 "./ecs/src"
//             ],
//             "@packages/ecs-app": [
//                 "./ecs-app/src"
//             ],
//             "@packages/define": [
//                 "./define/src"
//             ],
//             "@packages/ecs-input": [
//                 "./ecs-input/src"
//             ],
//             "@packages/ecs-ui": [
//                 "./ecs-ui/src"
//             ]
//         }


export const ChildOf = defineComponent(class ChildOf {
    parent: Entity;
    constructor(parent: Entity) {
        this.parent = parent;
    }
});

// export const Children = (await (import('define'))).defineComponent(class ChildOf {
//     children: Entity[];
//     constructor(children: Entity[]) {
//         this.children = children;
//     }
// });

export { }