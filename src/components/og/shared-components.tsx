import fs from "fs";
import path from "path";

// Load and convert the logo to base64
let logoBase64: string;
try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const logo = fs.readFileSync(logoPath);
    logoBase64 = `data:image/png;base64,${logo.toString("base64")}`;
} catch (error) {
    console.error("Failed to load logo:", error);
    // Fallback to empty string if logo can't be loaded
    logoBase64 = "";
}

// Shared watermark component
const OpenCouncilWatermark = () => (
    <div
        style={{
            position: "absolute",
            bottom: 40,
            right: 40,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            opacity: 0.7,
        }}
    >
        {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={logoBase64} width="20" height="20" alt="OpenCouncil" />
        <span
            style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#6b7280",
            }}
        >
            OpenCouncil
        </span>
    </div>
);

// Shared container component
export const Container = ({ children }: { children: React.ReactNode }) => (
    <div
        style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#ffffff",
            padding: "48px",
            position: "relative",
        }}
    >
        {children}
        <OpenCouncilWatermark />
    </div>
);

// Shared OG Header component
interface OgHeaderProps {
    city: {
        name: string;
        logoImage: string | null;
    };
    meeting?: {
        name: string;
        dateFormatted: string;
    };
}

export const OgHeader = ({ city, meeting }: OgHeaderProps) => (
    <div
        style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            marginBottom: 40,
        }}
    >
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                overflow: "hidden",
                width: "100%",
            }}
        >
            {/* City logo and name */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "20px",
                }}
            >
                {city.logoImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={city.logoImage}
            height="80"
            alt="City Logo"
                        style={{
                            objectFit: "contain",
                        }}
                    />
                )}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                    }}
                >
                    <span
                        style={{
                            fontSize: 28,
                            fontWeight: 600,
                            color: "#1f2937",
                            display: "flex",
                        }}
                    >
                        {city.name}
                    </span>
                </div>
            </div>

            {/* Add meeting info if provided */}
            {meeting && (
                <>
                    {/* Separator */}
                    <div
                        style={{
                            width: "1px",
                            height: "48px",
                            backgroundColor: "#e5e7eb",
                            margin: "0 20px",
                        }}
                    />

                    {/* Meeting info */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                            flexShrink: 1,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 20,
                                color: "#6b7280",
                                display: "flex",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {meeting.name}
                        </span>
                        <span
                            style={{
                                fontSize: 16,
                                color: "#9ca3af",
                                display: "flex",
                            }}
                        >
                            {meeting.dateFormatted}
                        </span>
                    </div>
                </>
            )}
        </div>
    </div>
);
