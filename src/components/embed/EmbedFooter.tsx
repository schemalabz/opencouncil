interface EmbedFooterProps {
    baseUrl: string;
    cityId: string;
}

export function EmbedFooter({ baseUrl, cityId }: EmbedFooterProps) {
    return (
        <div className="embed-footer">
            <a
                href={`${baseUrl}/${cityId}`}
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
