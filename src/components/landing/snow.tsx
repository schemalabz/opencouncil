'use client';

import { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

interface Snowflake {
    id: number;
    left: number;
    delay: number;
    duration: number;
    size: number;
    xOffset: number;
}

export function Snow() {
    const { scrollY } = useScroll();
    const opacity = useTransform(scrollY, [0, 600], [1, 0]);
    const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

    useEffect(() => {
        // Create more snowflakes for a festive effect
        const flakes: Snowflake[] = Array.from({ length: 80 }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            delay: Math.random() * 5,
            duration: 6 + Math.random() * 10, // 6-16 seconds (faster)
            size: 3 + Math.random() * 8, // 3-11px (more variation)
            xOffset: (Math.random() - 0.5) * 60,
        }));
        setSnowflakes(flakes);
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
            <motion.div style={{ opacity }} className="absolute inset-0 w-full h-full">
                {snowflakes.map((flake) => (
                    <motion.div
                        key={flake.id}
                        className="absolute rounded-full"
                        style={{
                            left: `${flake.left}%`,
                            width: `${flake.size}px`,
                            height: `${flake.size}px`,
                            top: '-30px',
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            boxShadow: '0 0 4px rgba(0, 0, 0, 0.2), 0 2px 3px rgba(0, 0, 0, 0.15)',
                        }}
                        animate={{
                            y: ['-20vh', '120vh'],
                            x: [
                                '0px',
                                `${flake.xOffset}px`,
                                `${flake.xOffset * 1.5}px`,
                            ],
                            opacity: [0, 1, 1, 0.8, 0],
                        }}
                        transition={{
                            duration: flake.duration,
                            delay: flake.delay,
                            repeat: Infinity,
                            ease: 'linear',
                        }}
                    />
                ))}
            </motion.div>
        </div>
    );
}

