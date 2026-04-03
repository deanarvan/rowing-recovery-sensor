import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Generates a surface of revolution from the 2D force curve.
 * The 2D curve (Position vs Force) is rotated around the Position axis.
 */
const ForceSurface = ({ data }) => {
    const geometry = useMemo(() => {
        const points = [];
        const segments = 32; // Number of radial segments for rotation

        // Generate vertices for surface of revolution
        data.forEach((point, i) => {
            const x = (point.position / 100) * 4 - 2; // Map 0-100 to -2 to 2
            const r = (point.actual / 100) * 1.5; // Radius based on force value

            for (let j = 0; j <= segments; j++) {
                const theta = (j / segments) * Math.PI * 2;
                const y = r * Math.cos(theta);
                const z = r * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
        });

        // Create BufferGeometry from points
        const geo = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        const colors = [];

        const numRings = data.length;
        const ringSize = segments + 1;

        // Add vertices and colors
        points.forEach((p, idx) => {
            vertices.push(p.x, p.y, p.z);
            // Color gradient based on height (force)
            const intensity = Math.sqrt(p.y * p.y + p.z * p.z) / 1.5;
            colors.push(0.22 + intensity * 0.3, 0.74 + intensity * 0.2, 0.97); // Sky blue gradient
        });

        // Create triangle indices
        for (let i = 0; i < numRings - 1; i++) {
            for (let j = 0; j < segments; j++) {
                const a = i * ringSize + j;
                const b = i * ringSize + j + 1;
                const c = (i + 1) * ringSize + j;
                const d = (i + 1) * ringSize + j + 1;

                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }

        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        return geo;
    }, [data]);

    return (
        <mesh geometry={geometry}>
            <meshStandardMaterial
                vertexColors
                side={THREE.DoubleSide}
                transparent
                opacity={0.85}
                metalness={0.3}
                roughness={0.5}
            />
        </mesh>
    );
};

const ForceCurve3D = ({ data }) => {
    return (
        <div className="glass-panel" style={{ width: '100%', height: '400px' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <h2 style={{ fontSize: '18px', color: '#f1f5f9', margin: 0 }}>3D Force Surface</h2>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
                    Rotate: drag | Zoom: scroll
                </p>
            </div>
            <Canvas style={{ background: 'transparent' }}>
                <PerspectiveCamera makeDefault position={[4, 2, 4]} fov={50} />
                <OrbitControls enablePan={false} />
                <ambientLight intensity={0.5} />
                <directionalLight position={[5, 5, 5]} intensity={1} />
                <directionalLight position={[-5, -5, -5]} intensity={0.3} />
                <ForceSurface data={data} />
                {/* Grid helper for reference */}
                <gridHelper args={[6, 12, '#334155', '#1e293b']} rotation={[0, 0, Math.PI / 2]} />
            </Canvas>
        </div>
    );
};

export default ForceCurve3D;
