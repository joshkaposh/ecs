import {
    World,
    Schedule,
    defineSystem,
    ThinWorld
} from "ecs";
import {
    defineComponent,
    defineComponent2
} from 'define'
import { TypedArray } from "joshkaposh-option";

const Comp1 = defineComponent(class Comp1 { constructor(public value = 'himom') { } })
const Comp2 = defineComponent(class Comp2 { constructor(public value = 'hidad') { } })

const Comp3 = defineComponent2({
    w: TypedArray.f32,
    x: TypedArray.f32
})


const Comp4 = defineComponent2({
    y: TypedArray.f32,
    z: TypedArray.f32
})

const world = new World();
const thin_world = new ThinWorld();
const schedule = new Schedule();

function init_thin() {
    for (let i = 0; i < 5000; i++) {
        thin_world.spawn(Comp3(0, 1));
    }

    for (let i = 0; i < 5000; i++) {
        thin_world.spawn(Comp3(0, 1), Comp4(1, 0));
    }

    schedule.addSystems(
        defineSystem(b => b.query([Comp1]), function query_system(query) {
            for (const _ of query) { }
        })
    )
}


function init() {
    for (let i = 0; i < 5000; i++) {
        world.spawn(new Comp1());
    }


    for (let i = 0; i < 5000; i++) {
        world.spawn(new Comp1(), new Comp2());
    }

    console.log(world.entities.length);

    schedule.addSystems(
        defineSystem(b => b.thinQuery([Comp3]), function query_system(query) {
            query.for_each(() => { })
        }))
}

const times = 60 * 1000;

function animate() {
    for (let i = 0; i < times; i++) {
        schedule.run(world);
    }
}

function animateThin() {
    for (let i = 0; i < times; i++) {
        schedule.run(thin_world as any);
    }
}

document.getElementById('start')?.addEventListener('click', (e) => {
    e.preventDefault();
    animate();
})

document.getElementById('start-thin')?.addEventListener('click', (e) => {
    e.preventDefault();
    animateThin();
})


init();
init_thin();