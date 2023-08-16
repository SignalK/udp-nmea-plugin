import dgram = require('dgram')
import os = require('os')
import { Netmask } from 'netmask'
import { ServerAPI } from '@signalk/server-api'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkgData = require('../package.json')

const DELIMITERS: { [key: string]: string } = {
  None: '',
  CRLF: '\r\n',
  LF: '\n',
}
type OnStopHandler = () => void

type DestinationConfig = {
  ipaddress?: string
  broadcastAddress?: string
  port: string
  lineDelimiter?: string
  nmea0183?: boolean
  nmea0183out?: string
  additionalEvents?: string
}

type DestinationConfigs = {
  destinations: DestinationConfig[]
}

type UdpPluginOptions = DestinationConfig | DestinationConfigs

const isDestinationConfigs = (
  options: UdpPluginOptions,
): options is DestinationConfigs => {
  return (options as DestinationConfigs).destinations !== undefined
}

module.exports = function (app: ServerAPI) {
  let socket: dgram.Socket
  let onStop = new Array<OnStopHandler>()
  const setStatus = app.setPluginStatus
  const setStatusError = app.setPluginError

  const startDestination = (options: DestinationConfig) => {
    app.debug(JSON.stringify(options))
    const address = options.ipaddress || options.broadcastAddress
    if (address && address != '-') {
      socket = dgram.createSocket('udp4')
      socket.bind(Number(address), function () {
        socket.setBroadcast(true)
      })

      const delimiter = DELIMITERS[options.lineDelimiter || ''] || ''
      const send = (message: string) => {
        const msg = `${message}${delimiter}`
        socket.send(msg, 0, msg.length, Number(options.port), address)
      }
      if (typeof options.nmea0183 === 'undefined' || options.nmea0183) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ; (app as any).signalk.on('nmea0183', send)
        onStop.push(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ; (app as any).signalk.removeListener('nmea0183', send)
        })
      }
      if (typeof options.nmea0183out === 'undefined' || options.nmea0183out) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ; (app as any).on('nmea0183out', send)
        onStop.push(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ; (app as any).removeListener('nmea0183out', send)
        })
      }
      if (Array.isArray(options.additionalEvents)) {
        options.additionalEvents.forEach(event => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ; (app as any).on(event, send)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStop.push(() => (app as any).removeListener(event, send))
        })
      }
      setStatus(`Using address ${address}`)
    } else {
      setStatusError('No address specified')
    }
  }
  return {
    start: (options: UdpPluginOptions) => {
      if (isDestinationConfigs(options)) {
        options.destinations.forEach(dest => startDestination(dest))
      } else {
        app.savePluginOptions({destinations: [options]}, err => {
          if (err) {
            setStatusError(err.toString())
          }
        })
        startDestination(options)
      }
    },
    stop: () => {
      onStop.forEach(f => f())
      onStop = []
      if (socket) {
        socket.close()
        socket = undefined
      }
    },
    schema,
    id: 'udp-nmea-sender',
    name: pkgData.description,
  }
}

function schema() {
  return {
    type: 'object',
    properties: {
      destinations: {

        type: 'array',
        items: {
          type: 'object',
          properties: {
            ipaddress: {
              type: 'string',
              title: 'IP Address (overrides broadcast address if entered)',
            },
            broadcastAddress: {
              type: 'string',
              enum: ['-'].concat(getBroadcastAddresses()),
              default: '-',
            },
            port: {
              type: 'number',
              title: 'Port',
              default: 2000,
            },
            nmea0183: {
              type: 'boolean',
              title: 'Use server event nmea0183',
              default: true,
            },
            nmea0183out: {
              type: 'boolean',
              title: 'Use server event nmea0183out',
              default: true,
            },
            additionalEvents: {
              type: 'array',
              title: 'Additional events whose data should be sent',
              items: {
                type: 'string',
              },
            },
            lineDelimiter: {
              type: 'string',
              title: 'Line delimiter',
              enum: ['None', 'LF', 'CRLF'],
              default: 'None',
            },
          },
        }
      }
    },
  }
}

function getBroadcastAddresses() {
  const result: string[] = []
  const ifaces = os.networkInterfaces()
  Object.keys(ifaces).forEach(id => {
    ifaces[id].forEach(addressInfo => {
      if (addressInfo.family === 'IPv4' && !addressInfo.internal) {
        const block = new Netmask(
          `${addressInfo.address}/${addressInfo.netmask}`,
        )
        result.push(block.broadcast)
      }
    })
  })
  const uniq_results = [...new Set(result)]
  return uniq_results
}
