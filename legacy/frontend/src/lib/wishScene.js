import { PerspectiveCamera, Scene } from "three";
import {
  CSS3DObject,
  CSS3DRenderer,
} from "three/addons/renderers/CSS3DRenderer.js";
import { createRotation } from "./wishState";

const colors = [
  "#ffe35b",
  "#67eddf",
  "#ffa0c7",
  "#56cafa",
  "#c9f54c",
  "#b2dcff",
];
export function createWishScene(container, onRound) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 1, 5000);
  camera.position.z = 1000;
  const renderer = new CSS3DRenderer();
  container.append(renderer.domElement);
  const rotation = createRotation();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let records = [],
    cards = [],
    width = 1,
    height = 1,
    elapsed = 0,
    last = 0,
    frame,
    lane = 0;
  const rows = () => (width < 600 ? 3 : 4);
  const worldHeight = 2 * Math.tan((25 * Math.PI) / 180) * 1000;
  const worldWidth = () => (worldHeight * width) / height;
  function remove(card) {
    scene.remove(card.object);
    card.object.element.remove();
    cards = cards.filter((item) => item !== card);
  }
  function add(record, immediate = false, initialX) {
    const element = document.createElement("article");
    element.className = `floating-wish${immediate ? " is-new" : ""}`;
    element.style.setProperty("--wish-color", colors[lane % colors.length]);
    const text = document.createElement("p");
    text.textContent = record.wish;
    const author = document.createElement("span");
    author.textContent = `— ${record.name || "Anonymous"}`;
    element.append(text, author);
    if (immediate) {
      const badge = document.createElement("small");
      badge.textContent = "NEW WISH";
      element.prepend(badge);
    }
    const object = new CSS3DObject(element);
    const z = immediate ? 90 : -(lane % 3) * 100;
    const scale = Math.min(0.95, worldWidth() / 480);
    object.scale.setScalar(scale);
    object.position.set(
      initialX ??
        (immediate || reduced.matches ? 0 : -worldWidth() / 2 - 320 * scale),
      worldHeight * 0.9 * (0.5 - ((lane % rows()) + 0.5) / rows()),
      z,
    );
    object.rotation.y = immediate ? 0 : ((lane % 3) - 1) * 0.04;
    lane++;
    scene.add(object);
    cards.push({ object, id: String(record.id), age: 0, scale, immediate });
    // Keep burst traffic bounded; every arrival is inserted into the visible scene.
    if (cards.length > 36) remove(cards[0]);
  }
  function next(initialX) {
    const item = rotation.next(records);
    if (item) {
      add(item.record, false, initialX);
      onRound(item.round);
    }
  }
  function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    // Reflow on orientation changes; all records remain in the rotation.
    for (const card of [...cards]) remove(card);
    rotation.reset();
    for (
      let i = 0;
      i < Math.min(records.length, rows() * (width < 600 ? 1 : 3));
      i++
    ) {
      next(
        ((Math.floor(i / rows()) - (width < 600 ? 0 : 1)) * worldWidth()) / 3,
      );
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  function animate(time) {
    const delta = last ? Math.min((time - last) / 1000, 0.1) : 0;
    last = time;
    elapsed += delta;
    for (const card of [...cards]) {
      card.age += delta;
      if (!reduced.matches && (!card.immediate || card.age > 5))
        card.object.position.x +=
          delta * (38 + (card.object.position.z + 200) * 0.035);
      if (
        (reduced.matches && card.age > 8) ||
        card.object.position.x > worldWidth() / 2 + 500 * card.scale
      )
        remove(card);
    }
    if (elapsed >= (reduced.matches ? 6 : 3.8)) {
      elapsed = 0;
      next();
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  resize();
  frame = requestAnimationFrame(animate);
  return {
    update(nextRecords, newRecords = []) {
      const previouslyEmpty = !records.length;
      records = nextRecords;
      const byId = new Map(records.map((row) => [String(row.id), row]));
      for (const card of [...cards]) {
        const row = byId.get(card.id);
        if (!row) remove(card);
        else {
          card.object.element.querySelector("p").textContent = row.wish;
          card.object.element.querySelector("span").textContent =
            `— ${row.name || "Anonymous"}`;
        }
      }
      if (!records.length) {
        rotation.reset();
        onRound(0);
      } else if (previouslyEmpty && !newRecords.length) resize();
      for (const row of newRecords) add(row, true);
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const card of [...cards]) remove(card);
      renderer.domElement.remove();
    },
  };
}
