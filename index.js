const dgram = require('dgram')
const os = require('os')
const { Netmask } = require('netmask')

const pkgData = require('./package.json')

module.exports = function (app) {
  let send
  let socket

  return {
    start: options => {
      const address = options.broadcastAddress || options.address
      if (address && address != '-') {
        socket = dgram.createSocket('udp4')
        socket.bind(options.ipaddress, function () {
          socket.setBroadcast(true)
        })
        send = message =>
          socket.send(
            message,
            0,
            message.length,
            options.port,
            options.ipaddress
          )
        app.signalk.on('nmea0183', send)
        app.setProviderStatus(`Using address ${address  }`)
      } else {
        app.setProviderError('No address specified')
      }
    },
    stop: () => {
      if (send) {
        app.signalk.removeListener('nmea0183', send)
        send = undefined
      }
      if (socket) {
        socket.close()
        socket = undefined
      }
    },
    schema,
    id: 'udp-nmea-sender',
    name: pkgData.description
  }
}

function schema () {
  return {
    type: 'object',
    properties: {
      ipaddress: {
        type: 'string',
        title: 'IP Address (overrides broadcast address if entered)'
      },
      broadcastAddress: {
        type: 'string',
        enum: ['-'].concat(getBroadcastAddresses()),
        default: '-'
      },
      port: {
        type: 'number',
        title: 'Port',
        default: 2000
      }
    }
  }
}

function getBroadcastAddresses () {
  const result = []
  const ifaces = os.networkInterfaces()
  Object.keys(ifaces).forEach(id => {
    ifaces[id].forEach(addressInfo => {
      if (addressInfo.family === 'IPv4' && !addressInfo.internal) {
        const block = new Netmask(
          `${addressInfo.address}/${addressInfo.netmask}`
        )
        result.push(block.broadcast)
      }
    })
  })
  return result
}
