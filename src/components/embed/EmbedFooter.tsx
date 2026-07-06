interface EmbedFooterProps {
    baseUrl: string;
    /** Links to the city page when known; falls back to the homepage. */
    cityId?: string;
}

export function EmbedFooter({ baseUrl, cityId }: EmbedFooterProps) {
    return (
        <div className="embed-footer">
            <a
                href={cityId ? `${baseUrl}/${cityId}` : baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="embed-footer-link"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={`${baseUrl}/logo.png`}
                    alt="OpenCouncil"
                    width={24}
                    height={24}
                    className="embed-footer-logo"
                />
                <span>OpenCouncil</span>
            </a>
        </div>
    );
}
