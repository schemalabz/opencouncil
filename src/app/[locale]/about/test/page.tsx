"use client"
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useState } from 'react'
import { Shape, ExtrudeGeometry } from 'three'

const Table = () => {
    const shape = new Shape()
    // Create the main rectangle of the pi shape
    shape.moveTo(-2, -0.3)
    shape.lineTo(2, -0.3)
    shape.lineTo(2, 0.3)
    shape.lineTo(-2, 0.3)
    shape.lineTo(-2, -0.3)

    // Add the left leg of the pi
    shape.moveTo(-1.8, -1.5)
    shape.lineTo(-1.8, -3)
    shape.lineTo(-1.2, -3)
    shape.lineTo(-1.2, -1.5)

    // Add the right leg of the pi
    shape.moveTo(1.2, -1.5)
    shape.lineTo(1.2, -3)
    shape.lineTo(1.8, -3)
    shape.lineTo(1.8, -1.5)

    const extrudeSettings = {
        steps: 2,
        depth: 0.2,
        bevelEnabled: false,
    }

    const geometry = new ExtrudeGeometry(shape, extrudeSettings)

    return (
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <primitive object={geometry} />
            <meshStandardMaterial color="#8B4513" />
        </mesh>
    )
}

const Chair = ({ position }: { position: [number, number, number] }) => (
    <group position={position}>
        <mesh position={[0, 0.4, 0]}>
            <coneGeometry args={[0.2, 0.5, 32]} />
            <meshStandardMaterial color="#4B0082" />
        </mesh>
        <mesh position={[0, 1, 0]}>
            <sphereGeometry args={[0.15, 32, 32]} />
            <meshStandardMaterial color="#4B0082" />
        </mesh>
    </group>
)

const Scene = () => {
    const [debugInfo, setDebugInfo] = useState("Initializing...")
    const { camera } = useThree()

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime()
        const initialHeight = 10
        const finalHeight = 3
        const rotationRadius = 5

        if (t < 3) {
            camera.position.set(0, initialHeight, 0)
            setDebugInfo(`Top-down view: ${t.toFixed(2)}s`)
        } else if (t < 6) {
            const progress = (t - 3) / 3
            const height = initialHeight - (initialHeight - finalHeight) * progress
            camera.position.set(0, height, 0)
            setDebugInfo(`Panning: ${t.toFixed(2)}s, Height: ${height.toFixed(2)}`)
        } else {
            const angle = (t - 6) * 0.5
            const x = Math.sin(angle) * rotationRadius
            const z = Math.cos(angle) * rotationRadius
            camera.position.set(x, finalHeight, z)
            setDebugInfo(`Rotating: ${t.toFixed(2)}s, X: ${x.toFixed(2)}, Z: ${z.toFixed(2)}`)
        }
        camera.lookAt(0, 0, 0)
    })

    return (
        <>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            <Table />
            <Chair position={[-2.5, 0, -2]} />
            <Chair position={[0, 0, -2]} />
            <Chair position={[2.5, 0, -2]} />
            <Chair position={[-2.5, 0, 2]} />
            <Chair position={[0, 0, 2]} />
            <Chair position={[2.5, 0, 2]} />
            <Chair position={[-3.5, 0, 0]} />
            <Chair position={[3.5, 0, 0]} />
            <Chair position={[-1.5, 0, 1.5]} />
            <Chair position={[1.5, 0, 1.5]} />
        </>
    )
}

export default function Component() {
    const [debugInfo, setDebugInfo] = useState("Initializing...")

    return (
        <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
            <Canvas camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 10, 0] }}>
                <Scene />
            </Canvas>
            <div style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(0,0,0,0.5)',
                color: 'white',
                padding: '5px'
            }}>
                {debugInfo}
            </div>
        </div>
    )
}