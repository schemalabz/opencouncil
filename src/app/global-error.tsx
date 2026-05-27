"use client"

// global-error.tsx replaces the root layout when an error is thrown during
// root layout rendering, so it must define its own <html> and <body>. It only
// fires when src/app/error.tsx can't recover (e.g. layout crash).

import { useEffect } from 'react'

interface GlobalErrorProps {
    error: Error & { digest?: string }
    reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <html lang="el">
            <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
                <div
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem',
                        textAlign: 'center',
                    }}
                >
                    <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Κάτι πήγε στραβά</h1>
                    <p style={{ marginBottom: '2rem', color: '#666' }}>
                        Παρουσιάστηκε ένα κρίσιμο σφάλμα. Δοκιμάστε να ανανεώσετε τη σελίδα.
                        {error.digest ? (
                            <>
                                <br />
                                <small>Κωδικός: <code>{error.digest}</code></small>
                            </>
                        ) : null}
                    </p>
                    <button
                        onClick={reset}
                        style={{
                            padding: '0.75rem 1.5rem',
                            fontSize: '1rem',
                            background: '#fc550a',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                        }}
                    >
                        Δοκιμάστε ξανά
                    </button>
                </div>
            </body>
        </html>
    )
}
