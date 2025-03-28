"use client";
import { useEffect, useRef } from 'react';

interface AuroraProps {
    className?: string;
    // You can uncomment these props to make the aurora configurable from outside
    speed?: number;  // Animation speed (0.01-1.0, default: 0.3)
    intensity?: number;
    quality?: 'low' | 'medium' | 'high';
}

export default function Aurora({
    className = "",
    speed = 0.2,
    intensity = 1.0,
    quality = 'medium'
}: AuroraProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Use refs instead of state for performance-critical values that don't need re-renders
    const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
    const mouseHistoryRef = useRef<Array<{ x: number; y: number; age: number }>>([]);
    const pulseTimeRef = useRef(0);
    const hasMouseSupportRef = useRef(false);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafIdRef = useRef<number>(0);
    const lastTimeRef = useRef(0);
    const resizedRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        // Colors from globals.css
        const orangeColor = '#fc550a'; // 252, 85, 10
        const blueColor = '#a4c0e1';   // 164, 192, 225
        // Add a highlight color for mouse interaction
        const highlightColor = '#ff9a47'; // Bright orange highlight

        // Create offscreen canvas only once
        if (!offscreenCanvasRef.current) {
            offscreenCanvasRef.current = document.createElement('canvas');
        }
        const offscreenCanvas = offscreenCanvasRef.current;
        const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });
        if (!offscreenCtx) return;

        // Parse colors once
        const orangeR = parseInt(orangeColor.slice(1, 3), 16);
        const orangeG = parseInt(orangeColor.slice(3, 5), 16);
        const orangeB = parseInt(orangeColor.slice(5, 7), 16);

        const blueR = parseInt(blueColor.slice(1, 3), 16);
        const blueG = parseInt(blueColor.slice(3, 5), 16);
        const blueB = parseInt(blueColor.slice(5, 7), 16);

        const highlightR = parseInt(highlightColor.slice(1, 3), 16);
        const highlightG = parseInt(highlightColor.slice(3, 5), 16);
        const highlightB = parseInt(highlightColor.slice(5, 7), 16);

        // ==============================================
        // Aurora animation control variables
        // ==============================================

        // Quality settings
        const qualitySettings = {
            low: {
                dotSize: 20,
                stepSize: 18,
                blurAmount: 10,
                octaves: 2
            },
            medium: {
                dotSize: 16,
                stepSize: 14,
                blurAmount: 12,
                octaves: 2
            },
            high: {
                dotSize: 14,
                stepSize: 10,
                blurAmount: 15,
                octaves: 3
            }
        };

        const settings = qualitySettings[quality];

        /**
         * Controls the speed of the aurora animation
         * - Higher value = faster movement
         */
        const auroraSpeed = 0.0003 * speed;

        /**
         * Controls the visual intensity of the aurora effect
         * - Higher values = more vibrant, intense colors
         */
        const auroraIntensity = 0.9 * intensity;

        // Detect mouse support - if a pointer event is detected, 
        // we'll assume mouse support is available
        hasMouseSupportRef.current = window.matchMedia('(pointer: fine)').matches;

        // Function to handle canvas resize
        const handleResize = () => {
            const parentElement = canvas.parentElement;
            if (!parentElement) return;

            // Set canvas size to match parent container
            const width = parentElement.offsetWidth;
            const height = parentElement.offsetHeight;

            // Only update if size actually changed
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;

                // Set offscreen canvas size once on resize
                const scaleFactor = quality === 'low' ? 0.15 : quality === 'medium' ? 0.2 : 0.25;
                offscreenCanvas.width = Math.floor(canvas.width * scaleFactor);
                offscreenCanvas.height = Math.floor(canvas.height * scaleFactor);

                resizedRef.current = true;
            }
        };

        // Initialize canvas size
        handleResize();

        // Throttled resize handler
        let resizeTimeout: number;
        const throttledResize = () => {
            if (resizeTimeout) return;
            resizeTimeout = window.setTimeout(() => {
                handleResize();
                resizeTimeout = 0;
            }, 200);
        };

        // Add resize listener
        window.addEventListener('resize', throttledResize);

        // Mouse movement handler
        const handleMouseMove = (e: MouseEvent) => {
            if (!hasMouseSupportRef.current) return;

            const rect = canvas.getBoundingClientRect();
            mousePositionRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            // Add to history for trail effect - limit to fewer points
            mouseHistoryRef.current.push({
                ...mousePositionRef.current,
                age: 0
            });

            if (mouseHistoryRef.current.length > 4) {
                mouseHistoryRef.current.shift();
            }

            // Reset pulse time for ripple effect
            pulseTimeRef.current = 0;
        };

        // Throttled mouse move handler
        let mouseMoveThrottleTimeout: number;
        const throttledMouseMove = (e: MouseEvent) => {
            if (mouseMoveThrottleTimeout) return;
            mouseMoveThrottleTimeout = window.setTimeout(() => {
                handleMouseMove(e);
                mouseMoveThrottleTimeout = 0;
            }, 30); // 30ms throttle
        };

        // Add mouse move listener only on devices with mouse support
        if (hasMouseSupportRef.current) {
            canvas.addEventListener('mousemove', throttledMouseMove);
            canvas.addEventListener('mouseleave', () => {
                mousePositionRef.current = null;
                mouseHistoryRef.current = [];
            });
        }

        // Animation parameters
        const noiseScale = 0.0028;
        const noiseSpeed = auroraSpeed;

        // Optimized noise function
        const noise = (x: number, y: number, z: number) => {
            let value = 0;
            let amplitude = 1;
            let frequency = 1;

            // Add mouse influence when available
            let mouseInfluence = 0;
            let rippleEffect = 0;

            if (hasMouseSupportRef.current && mousePositionRef.current) {
                const mousePos = mousePositionRef.current;
                const canvasWidth = canvas.width;
                const canvasHeight = canvas.height;

                // Normalize coordinates
                const mouseX = mousePos.x / canvasWidth;
                const mouseY = mousePos.y / canvasHeight;
                const pointX = x / canvasWidth;
                const pointY = y / canvasHeight;

                // Calculate distance
                const dx = pointX - mouseX;
                const dy = pointY - mouseY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Influence range
                const maxInfluenceRange = 0.45;
                mouseInfluence = Math.max(0, 1 - (distance / maxInfluenceRange));
                mouseInfluence = Math.pow(mouseInfluence, 2);

                // Add ripple effect
                if (pulseTimeRef.current < 2.0) {
                    const rippleRadius = pulseTimeRef.current * 0.2;
                    const rippleWidth = 0.03;
                    const distanceInRipple = Math.abs(distance - rippleRadius);

                    if (distanceInRipple < rippleWidth) {
                        rippleEffect = (1 - distanceInRipple / rippleWidth) * (1 - pulseTimeRef.current / 2.0) * 1.3;
                    }
                }

                // Add trail effect - simplified
                mouseHistoryRef.current.forEach(pos => {
                    if (pos.age > 1.0) return;

                    const historyX = pos.x / canvasWidth;
                    const historyY = pos.y / canvasHeight;
                    const historyDx = pointX - historyX;
                    const historyDy = pointY - historyY;
                    const historyDistance = Math.sqrt(historyDx * historyDx + historyDy * historyDy);

                    const trailInfluence = Math.max(0, 1 - (historyDistance / (maxInfluenceRange * 0.6)));
                    const ageFactor = 1 - pos.age;
                    mouseInfluence = Math.max(mouseInfluence, trailInfluence * ageFactor * 0.6);
                });
            }

            // Reduced octaves for better performance
            for (let i = 0; i < settings.octaves; i++) {
                const mouseFrequencyBoost = mouseInfluence * 3 + rippleEffect * 8;
                const rippleDisplacement = rippleEffect * 0.5;

                value += amplitude *
                    Math.sin(x * noiseScale * (frequency + mouseFrequencyBoost) + z * (i * 0.1 + 0.5) + rippleDisplacement) *
                    Math.sin(y * noiseScale * (frequency + mouseFrequencyBoost * 0.5) + z * (i * 0.15 + 0.3) + rippleDisplacement);

                amplitude *= 0.5;
                frequency *= 2;
            }

            return 0.5 + 0.5 * value;
        };

        // Optimize frame rate based on device capability
        const maxFPS = 30;
        const frameInterval = 1000 / maxFPS;
        let lastFrameTime = 0;

        // Animation function
        const animate = (time: number) => {
            // Throttle frame rate
            if (time - lastFrameTime < frameInterval) {
                rafIdRef.current = requestAnimationFrame(animate);
                return;
            }
            lastFrameTime = time;

            // Calculate delta time for consistent animation
            const deltaTime = Math.min(33, time - lastTimeRef.current); // Cap delta time to avoid jumps
            lastTimeRef.current = time;

            // Update pulse time
            if (mousePositionRef.current) {
                pulseTimeRef.current += deltaTime * 0.001;
            }

            // Update mouse history with fewer calculations
            mouseHistoryRef.current = mouseHistoryRef.current
                .map(pos => ({ ...pos, age: pos.age + deltaTime * 0.001 }))
                .filter(pos => pos.age < 1.2);

            // Clear main canvas
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Setup for drawing
            const scaleFactor = quality === 'low' ? 0.15 : quality === 'medium' ? 0.2 : 0.25;

            // Only resize offscreen canvas when main canvas is resized
            if (resizedRef.current) {
                offscreenCanvas.width = Math.floor(canvas.width * scaleFactor);
                offscreenCanvas.height = Math.floor(canvas.height * scaleFactor);
                resizedRef.current = false;
            }

            // Clear offscreen canvas
            offscreenCtx.fillStyle = 'white';
            offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

            // Drawing parameters
            const dotSize = settings.dotSize;
            const stepSize = settings.stepSize;

            // Only draw in top 1/3 of the screen
            const heightLimit = offscreenCanvas.height * 0.33;

            // Threshold balancing
            const noiseThreshold = 0.42 - (auroraIntensity * 0.15);

            // Draw to offscreen canvas
            for (let x = 0; x < offscreenCanvas.width; x += stepSize) {
                for (let y = 0; y < heightLimit; y += stepSize) {
                    // Calculate noise with temporal stability
                    const noiseValue = noise(
                        x / scaleFactor,
                        y / scaleFactor,
                        time * noiseSpeed
                    );

                    // Skip drawing for values well below threshold
                    if (noiseValue < noiseThreshold - 0.05) continue;

                    // Gradual fade-in near threshold for smoother appearance
                    const thresholdFade = Math.min(1, (noiseValue - (noiseThreshold - 0.05)) / 0.05);

                    // Track mouse influence
                    let mouseEffect = 0;
                    let isInRipple = false;

                    if (hasMouseSupportRef.current && mousePositionRef.current) {
                        const mouseX = mousePositionRef.current.x * scaleFactor;
                        const mouseY = mousePositionRef.current.y * scaleFactor;
                        const dx = x - mouseX;
                        const dy = y - mouseY;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        const mouseInfluenceRadius = offscreenCanvas.width * 0.25;
                        if (distance < mouseInfluenceRadius) {
                            mouseEffect = 1 - (distance / mouseInfluenceRadius);
                            mouseEffect = mouseEffect * mouseEffect; // Squared for efficiency

                            // Check for ripple effect
                            if (pulseTimeRef.current < 2.0) {
                                const rippleRadius = pulseTimeRef.current * mouseInfluenceRadius * 0.5;
                                const rippleWidth = mouseInfluenceRadius * 0.06;
                                const distanceFromRipple = Math.abs(distance - rippleRadius);

                                if (distanceFromRipple < rippleWidth) {
                                    isInRipple = true;
                                }
                            }
                        }

                        // Simplified trail points check
                        if (mouseHistoryRef.current.length > 0 && !isInRipple) {
                            // Just check the most recent trail point
                            const pos = mouseHistoryRef.current[mouseHistoryRef.current.length - 1];
                            if (pos.age < 0.8) {
                                const trailX = pos.x * scaleFactor;
                                const trailY = pos.y * scaleFactor;
                                const trailDx = x - trailX;
                                const trailDy = y - trailY;
                                const trailDistance = Math.sqrt(trailDx * trailDx + trailDy * trailDy);

                                const trailRadius = offscreenCanvas.width * 0.18;
                                if (trailDistance < trailRadius) {
                                    const trailEffect = (1 - trailDistance / trailRadius) * (1 - pos.age);
                                    mouseEffect = Math.max(mouseEffect, trailEffect * 0.5);
                                }
                            }
                        }
                    }

                    // Use noise to mix between orange and blue
                    // Modified to favor blue colors slightly
                    let ratio = noiseValue * 1.2;
                    ratio = Math.min(ratio, 1);

                    // Less white mixing for more intense colors
                    const whiteMix = 0.7 - (auroraIntensity * 0.5);
                    let enhancedWhiteMix = whiteMix;

                    let r, g, b;

                    if (mouseEffect > 0) {
                        enhancedWhiteMix = whiteMix * (1 - (mouseEffect * 0.85));

                        if (isInRipple) {
                            r = highlightR;
                            g = highlightG;
                            b = highlightB;
                        } else {
                            // Bias ratio towards orange for mouse-influenced areas
                            ratio = ratio * (1 - mouseEffect * 0.7);

                            // Linear interpolation between colors
                            r = Math.floor(orangeR * (1 - ratio) + blueR * ratio);
                            g = Math.floor(orangeG * (1 - ratio) + blueG * ratio);
                            b = Math.floor(orangeB * (1 - ratio) + blueB * ratio);

                            // Blend with highlight color
                            r = Math.floor(r * (1 - mouseEffect * 0.5) + highlightR * (mouseEffect * 0.5));
                            g = Math.floor(g * (1 - mouseEffect * 0.5) + highlightG * (mouseEffect * 0.5));
                            b = Math.floor(b * (1 - mouseEffect * 0.5) + highlightB * (mouseEffect * 0.5));
                        }
                    } else {
                        // Linear interpolation between colors
                        r = Math.floor(orangeR * (1 - ratio) + blueR * ratio);
                        g = Math.floor(orangeG * (1 - ratio) + blueG * ratio);
                        b = Math.floor(orangeB * (1 - ratio) + blueB * ratio);
                    }

                    // Mix with white
                    if (!isInRipple) {
                        r = Math.floor(r * (1 - enhancedWhiteMix) + 255 * enhancedWhiteMix);
                        g = Math.floor(g * (1 - enhancedWhiteMix) + 255 * enhancedWhiteMix);
                        b = Math.floor(b * (1 - enhancedWhiteMix) + 255 * enhancedWhiteMix);
                    }

                    // Calculate opacity based on y-position and noise
                    const yRatio = y / heightLimit;
                    const fadeOut = 1 - yRatio * yRatio; // Square is faster than pow()

                    // Higher base alpha for more intensity
                    const baseAlpha = (0.1 + (auroraIntensity * 0.15)) * thresholdFade;
                    let alpha = baseAlpha * fadeOut * (0.5 + 0.5 * noiseValue);

                    // Increase alpha near mouse
                    if (mouseEffect > 0) {
                        alpha *= (1 + (mouseEffect * 2.2));

                        if (isInRipple) {
                            alpha *= 2.8;
                        }
                    }

                    // Draw gradient point
                    offscreenCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

                    // Make dots larger near the mouse
                    const dynamicDotSize = isInRipple ?
                        dotSize * 1.3 :
                        dotSize * (1 + (mouseEffect * 0.4));

                    offscreenCtx.beginPath();
                    offscreenCtx.arc(x, y, dynamicDotSize, 0, Math.PI * 2);
                    offscreenCtx.fill();
                }
            }

            // Apply blur - less blur for more definition
            const blurAmount = settings.blurAmount - (auroraIntensity * 3);
            offscreenCtx.filter = `blur(${blurAmount}px)`;
            offscreenCtx.drawImage(offscreenCanvas, 0, 0);

            // Add fade-out gradient
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
            rafIdRef.current = requestAnimationFrame(animate);
        };

        // Start animation
        rafIdRef.current = requestAnimationFrame(animate);

        // Cleanup function
        return () => {
            window.removeEventListener('resize', throttledResize);
            if (hasMouseSupportRef.current) {
                canvas.removeEventListener('mousemove', throttledMouseMove);
                canvas.removeEventListener('mouseleave', () => {
                    mousePositionRef.current = null;
                    mouseHistoryRef.current = [];
                });
            }
            cancelAnimationFrame(rafIdRef.current);
            clearTimeout(resizeTimeout);
            clearTimeout(mouseMoveThrottleTimeout);
        };
    }, [speed, intensity, quality]);

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
