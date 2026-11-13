import { CreateBucketCommand, DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import type { HttpRequest } from '@smithy/types'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'

/**
 * A throwaway S3 server (Adobe S3Mock) for integration tests, and a way to
 * send the app's own S3 client to it.
 *
 * The app's client (src/lib/s3.ts) is built when its module loads, from the
 * env mock's DO_SPACES_ENDPOINT (https://example.com), in the virtual-host
 * style that Spaces uses: `https://{bucket}.example.com/{key}`. routeToMock
 * adds one step before the request is signed. It sends every request to the
 * container instead, in the path style that S3Mock serves
 * (`http://localhost:{port}/{bucket}/{key}`). So the test runs the real
 * client code, and no request can leave for a real bucket: the endpoint in
 * the env mock is example.com, and the step refuses any other host.
 */
export async function startS3Mock(): Promise<{ container: StartedTestContainer; host: string; port: number }> {
    const container = await new GenericContainer('adobe/s3mock:4.7.0')
        .withExposedPorts(9090)
        .withWaitStrategy(Wait.forHttp('/', 9090).forStatusCodeMatching(() => true))
        .start()
    return { container, host: container.getHost(), port: container.getMappedPort(9090) }
}

export function routeToMock(client: S3Client, target: { host: string; port: number }): void {
    client.middlewareStack.add(
        (next) => async (args) => {
            const request = args.request as HttpRequest
            const match = /^(.+)\.example\.com$/.exec(request.hostname)
            if (!match) throw new Error(`S3 request to ${request.hostname} refused: the test sends only example.com requests to the mock`)
            request.protocol = 'http:'
            request.hostname = target.host
            request.port = target.port
            request.path = `/${match[1]}${request.path}`
            request.headers.host = `${target.host}:${target.port}`
            return next(args)
        },
        { step: 'build', name: 'routeToS3Mock', priority: 'low' },
    )
}

export async function putObject(client: S3Client, bucket: string, key: string): Promise<void> {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'clip', ContentType: 'audio/mpeg' }))
}

export async function createBucket(client: S3Client, bucket: string): Promise<void> {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
}

export async function deleteObject(client: S3Client, bucket: string, key: string): Promise<void> {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export async function keysIn(client: S3Client, bucket: string): Promise<string[]> {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket }))
    return (page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : [])).sort()
}
