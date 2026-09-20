import * as THREE from "three";

/**
 * Three.js holds GPU-side buffers that garbage collection cannot reach.
 * Dropping a model with `scene.remove(obj)` alone detaches it from the graph but
 * leaves its geometries, materials and textures resident on the GPU — loading a
 * handful of game assets in sequence is enough to exhaust VRAM and kill the tab.
 * Every resource has to be disposed explicitly.
 */
export function disposeObject3D(root: THREE.Object3D): void {
    root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;

        mesh.geometry?.dispose();

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
            if (!material) continue;
            disposeMaterial(material);
        }
    });
}

/** Disposes a material along with every texture map hanging off it. */
function disposeMaterial(material: THREE.Material): void {
    for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value && (value as THREE.Texture).isTexture) {
            (value as THREE.Texture).dispose();
        }
    }
    material.dispose();
}

/**
 * Tears down a renderer completely.
 *
 * `renderer.dispose()` on its own does not release the underlying WebGL context.
 * Browsers cap the number of live contexts (commonly 8–16) and silently kill the
 * oldest once that cap is hit, so a viewer that mounts and unmounts repeatedly
 * will start blanking out earlier instances without `forceContextLoss()`.
 */
export function disposeRenderer(renderer: THREE.WebGLRenderer): void {
    renderer.dispose();
    renderer.forceContextLoss();
}
