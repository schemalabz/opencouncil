import { NextResponse } from 'next/server'
import net from 'net'
import os from 'os'
import { IS_DEV } from '@/lib/utils'

export async function GET() {
  if (!IS_DEV) {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  const interfaces = os.networkInterfaces()
  let lanIp: string | null = null

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIp = iface.address
        break
      }
    }
    if (lanIp) break
  }

  const port = process.env.APP_PORT || '3000'
  const portNum = parseInt(port, 10)

  // Check if server is bound to 0.0.0.0 (--lan mode)
  // A simple heuristic: try connecting to our own LAN IP on the app port
  const boundToLan = lanIp
    ? await new Promise<boolean>((resolve) => {
        const sock = net.createConnection({ host: lanIp!, port: portNum, timeout: 500 })
        sock.once('connect', () => { sock.destroy(); resolve(true) })
        sock.once('error', () => { sock.destroy(); resolve(false) })
        sock.once('timeout', () => { sock.destroy(); resolve(false) })
      })
    : false

  if (!lanIp) {
    return NextResponse.json({ available: false, ip: null, port, url: null, boundToLan: false })
  }

  return NextResponse.json({
    available: boundToLan,
    ip: lanIp,
    port,
    url: `http://${lanIp}:${port}`,
    boundToLan,
  })
}
