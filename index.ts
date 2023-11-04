const fs = require('fs');
const path = require('path');
import { events } from "bdsx/event";
import { CommandResultType } from "bdsx/commandresult";
import { bedrockServer } from "bdsx/launcher";
import { Server, createServer } from 'net';

let config: any;
let server: Server;
const host = '0.0.0.0';

events.serverStop.on(() => {
    server.close();
    process.exit();
})

events.serverOpen.on(() => {
    const configPath = path.join(__dirname, 'config.json');
    const defaultConfig = {
        'enable-rcon': true,
        'rcon': {
            'password': '',
            'port': 25575
        }
    };

    if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configFile);
    } else {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        config = defaultConfig;
    }


    if (config.rcon.password !== '') {
        server = createServer((client: any) => {
            console.log(`[BDSX-RCON] RCON Client /${client?.remoteAddress} started`);

            client.on('close', () => {
                console.log(`[BDSX-RCON] RCON Client /${client?.remoteAddress} shutting down`);
                client.isRconConnected = false;
            });

            client.on('data', (data: Buffer) => {
                var pkt = new Packet(data).read();

                switch (pkt.type) {
                    case RCON_PACKET_TYPE.SERVERDATA_AUTH:
                        if (pkt.body === config.rcon.password) {
                            client.write(new Packet().write(RCON_PACKET_TYPE.SERVERDATA_AUTH_RESPONSE, pkt.id));
                            client.isRconConnected = true;

                            break;
                        }

                        client.write(new Packet().write(RCON_PACKET_TYPE.SERVERDATA_AUTH_RESPONSE, -1));
                        break;
                    case RCON_PACKET_TYPE.SERVERDATA_EXECCOMMAND:
                        if (client.isRconConnected) {
                            const res = bedrockServer.executeCommand(pkt.body, CommandResultType.Data)?.data?.statusMessage;
                            client.write(new Packet().write(RCON_PACKET_TYPE.SERVERDATA_RESPONSE_VALUE, pkt.id, res ? res.replace(/§[0-9a-fklmnor]/g, '') : ''));
                        }
                        break;
                    default:
                        break;
                }
            });
        });

        server.listen(config.rcon.port, host, () => {
            console.log(`[BDSX-RCON] RCON Listener started`);
            console.log(`[BDSX-RCON] RCON running on ${host}:${config.rcon.port}`);
        });

        return;
    }

    console.log('\x1b[93m' + `[BDSX-RCON] No rcon password set in config, rcon disabled!` + '\x1b[0m');
    console.log('\x1b[93m' + `[BDSX-RCON] Change it here -> ` + '\x1b[0m\x1b[1m\x1b[4m' + configPath + '\x1b[0m');
});

class Packet {
    private buffer: Buffer;

    constructor(buffer: Buffer = Buffer.alloc(0)) {
        this.buffer = buffer;
    }

    write(type: number, id: number, body: string = '') {
        var size = Buffer.byteLength(body) + 14,
            buffer = Buffer.alloc(size);

        buffer.writeInt32LE(size - 4, 0);
        buffer.writeInt32LE(id, 4);
        buffer.writeInt32LE(type, 8);
        buffer.write(body, 12, size - 2, "ascii");
        buffer.writeInt16LE(0, size - 2);

        return buffer;
    };

    read() {
        var response = {
            size: this.buffer.readInt32LE(0),
            id: this.buffer.readInt32LE(4),
            type: this.buffer.readInt32LE(8),
            body: this.buffer.toString("ascii", 12, this.buffer.length - 2)
        }

        return response;
    };
}

const RCON_PACKET_TYPE = {
    SERVERDATA_AUTH: 3,
    SERVERDATA_AUTH_RESPONSE: 2,
    SERVERDATA_EXECCOMMAND: 2,
    SERVERDATA_RESPONSE_VALUE: 0
}