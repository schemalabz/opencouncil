import { ComponentType } from "react";
import { DimotikaSymvouliaBody } from "./dimotika-symvoulia";

/** Registry of article prose bodies, keyed by slug. */
export const ARTICLE_BODIES: Record<string, ComponentType> = {
    "dimotika-symvoulia": DimotikaSymvouliaBody,
};
