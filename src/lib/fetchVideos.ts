"use server";

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export interface Video {
    id: string;
    name: string;
    dateAdded: string;
}

export async function fetchVideos(): Promise<Video[]> {
    console.log("fetchVideos");
    const s3Client = new S3Client({
        endpoint: process.env.DO_SPACES_ENDPOINT,
        region: "us-east-1", // DigitalOcean Spaces use this region
        credentials: {
            accessKeyId: process.env.DO_SPACES_KEY!,
            secretAccessKey: process.env.DO_SPACES_SECRET!,
        }
    });

    const command = new ListObjectsV2Command({
        Bucket: process.env.DO_SPACES_BUCKET,
        Prefix: "city-council-meetings/",
    });

    try {
        const response = await s3Client.send(command);
        console.log("response");
        console.log(response);
        if (!response.Contents) {
            return [];
        }

        const videos: Video[] = response.Contents
            .filter(object => object.Key?.endsWith('.mp4'))
            .map((object): Video => {
                const filename = object.Key!.split('/').pop()!;
                return {
                    id: filename,
                    name: filename,
                    dateAdded: object.LastModified?.toISOString() || '',
                };
            });

        return videos;
    } catch (error) {
        console.error("Error fetching videos:", error);
        return [];
    }
}
