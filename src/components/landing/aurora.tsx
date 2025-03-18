import { useEffect, useRef } from 'react';

interface AuroraProps {
    className?: string;
    // You can uncomment these props to make the aurora configurable from outside
    speed?: 0.5;  // Animation speed (0.01-1.0, default: 0.3)
    intensity?: 0.8;
}

export default function Aurora({ className = "" }: AuroraProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Colors from globals.css
        const orangeColor = '#fc550a'; // 252, 85, 10
        const blueColor = '#a4c0e1';   // 164, 192, 225

        // ==============================================
        // Aurora animation control variables
        // ==============================================

        /**
         * Controls the speed of the aurora animation
         * - Lower values (0.00005) = very slow, gentle movement
         * - Higher values (0.001) = faster, more dynamic movement
         * - Default: 0.0001
         */
        const auroraSpeed = 0.0001;

        /**
         * Controls the visual intensity of the aurora effect
         * - Lower values (0.1-0.3) = subtle, faint colors
         * - Higher values (0.7-1.0) = vibrant, intense colors
         * - Default: 0.6
         * 
         * This affects:
         * - Color vividness (less white mixing at higher values)
         * - Overall opacity
         * - Pattern density
         */
        const auroraIntensity = 0.6;

        let animationFrameId: number;

        // Function to handle canvas resize
        const handleResize = () => {
            const parentElement = canvas.parentElement;
            if (!parentElement) return;

            // Set canvas size to match parent container
            canvas.width = parentElement.offsetWidth;
            canvas.height = parentElement.offsetHeight;
        };

        // Initialize canvas size
        handleResize();

        // Add resize listener
        window.addEventListener('resize', handleResize);

        // Animation parameters
        const noiseScale = 0.002; // Even bigger patterns
        const noiseSpeed = auroraSpeed; // Using our configurable speed variable

        // Create smooth noise function
        const noise = (x: number, y: number, z: number) => {
            // Smoother noise function with multiple octaves
            let value = 0;
            let amplitude = 1;
            let frequency = 1;

            // Add multiple sine waves at different frequencies for smoother noise
            for (let i = 0; i < 3; i++) {
                value += amplitude * Math.sin(x * noiseScale * frequency + z * (i * 0.1 + 0.5)) *
                    Math.sin(y * noiseScale * frequency + z * (i * 0.15 + 0.3));
                amplitude *= 0.5;
                frequency *= 2;
            }

            return 0.5 + 0.5 * value;
        };

        // Pre-render to an offscreen canvas with smaller size for blur effect
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');

        if (!offscreenCtx) return;

        // Animation function
        const animate = (time: number) => {
            // Clear main canvas
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Set up offscreen canvas at a smaller size (for blur effect)
            const scaleFactor = 0.25; // Even smaller for more blur
            offscreenCanvas.width = canvas.width * scaleFactor;
            offscreenCanvas.height = canvas.height * scaleFactor;

            // Clear offscreen canvas
            offscreenCtx.fillStyle = 'white';
            offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

            // Drawing parameters
            const dotSize = 15; // Even larger dots for softer effect
            const stepSize = 12; // Larger step for more spacing (less density)

            // Only draw in top 1/3 of the screen
            const heightLimit = offscreenCanvas.height * 0.33;

            // Intensity affects dot threshold - higher intensity = more dots
            const noiseThreshold = 0.4 - (auroraIntensity * 0.15);

            // Draw to offscreen canvas - limited to first third
            for (let x = 0; x < offscreenCanvas.width; x += stepSize) {
                for (let y = 0; y < offscreenCanvas.height; y += stepSize) {
                    // Skip drawing if beyond the first third
                    if (y > heightLimit) continue;

                    // Calculate noise value based on position and time
                    const noiseValue = noise(
                        x / scaleFactor,
                        y / scaleFactor,
                        time * noiseSpeed
                    );

                    // Only draw some dots based on noise value (creates more white space)
                    if (noiseValue < noiseThreshold) continue;

                    // Use noise to mix between orange and blue
                    const ratio = noiseValue;

                    // Create more intense colors by reducing white mix
                    // Higher intensity means less white mixing (more vivid colors)
                    const whiteMix = 0.8 - (auroraIntensity * 0.5);

                    // Linear interpolation (lerp) between colors
                    let r = Math.floor(parseInt(orangeColor.slice(1, 3), 16) * (1 - ratio) +
                        parseInt(blueColor.slice(1, 3), 16) * ratio);
                    let g = Math.floor(parseInt(orangeColor.slice(3, 5), 16) * (1 - ratio) +
                        parseInt(blueColor.slice(3, 5), 16) * ratio);
                    let b = Math.floor(parseInt(orangeColor.slice(5, 7), 16) * (1 - ratio) +
                        parseInt(blueColor.slice(5, 7), 16) * ratio);

                    // Mix with white
                    r = Math.floor(r * (1 - whiteMix) + 255 * whiteMix);
                    g = Math.floor(g * (1 - whiteMix) + 255 * whiteMix);
                    b = Math.floor(b * (1 - whiteMix) + 255 * whiteMix);

                    // Calculate opacity based on y-position and noise
                    // Strong fade out toward the bottom third
                    const yRatio = y / heightLimit;
                    // Use cubic function for sharper fade
                    const fadeOut = 1 - Math.pow(yRatio, 3);

                    // Higher intensity means higher base opacity
                    const baseAlpha = 0.08 + (auroraIntensity * 0.12);
                    const alpha = baseAlpha * fadeOut * (0.5 + 0.5 * noiseValue);

                    // Draw gradient point with rounded shape for smoother appearance
                    offscreenCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                    offscreenCtx.beginPath();
                    offscreenCtx.arc(x, y, dotSize, 0, Math.PI * 2);
                    offscreenCtx.fill();
                }
            }

            // Apply blur to the offscreen canvas
            // Less blur for higher intensity (more definition at higher intensities)
            const blurAmount = 20 - (auroraIntensity * 4);
            offscreenCtx.filter = `blur(${blurAmount}px)`;
            offscreenCtx.drawImage(offscreenCanvas, 0, 0);

            // Add additional white gradient to enhance fade out
            const gradient = offscreenCtx.createLinearGradient(0, heightLimit * 0.6, 0, heightLimit);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');

            offscreenCtx.fillStyle = gradient;
            offscreenCtx.fillRect(0, heightLimit * 0.6, offscreenCanvas.width, heightLimit * 0.4);

            // Draw offscreen canvas onto main canvas
            ctx.drawImage(
                offscreenCanvas,
                0, 0, offscreenCanvas.width, offscreenCanvas.height,
                0, 0, canvas.width, canvas.height
            );

            // Continue animation
            animationFrameId = requestAnimationFrame(animate);
        };

        // Start animation
        animationFrameId = requestAnimationFrame(animate);

        // Cleanup function
        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={`aurora-canvas ${className}`}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                background: 'white',
            }}
        />
    );
}
