import { connect } from 'node:net';

export interface Scanner {
  /** Retourne le nom de la détection, ou null si le contenu est sain. Lève une erreur si l'analyse est impossible. */
  scan(data: Buffer): Promise<string | null>;
}

/** Client clamd (commande INSTREAM). Échec fermé : si l'analyse est impossible, l'appelant refuse le fichier. */
export class ClamAvScanner implements Scanner {
  constructor(private readonly host: string, private readonly port: number, private readonly timeoutMs = 15_000) {}

  scan(data: Buffer): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      const fail = (error: Error) => { socket.destroy(); reject(error); };
      socket.setTimeout(this.timeoutMs, () => fail(new Error('antivirus : délai dépassé')));
      socket.on('error', (e) => fail(new Error(`antivirus indisponible : ${e.message}`)));
      socket.on('data', (c) => chunks.push(c));
      socket.on('end', () => {
        const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
        if (/OK$/.test(reply)) resolve(null);
        else {
          const found = /^stream:\s*(.+)\s+FOUND$/.exec(reply);
          if (found) resolve(found[1]!);
          else reject(new Error(`antivirus : réponse inattendue (${reply.slice(0, 80)})`));
        }
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < data.length; offset += 64 * 1024) {
          const part = data.subarray(offset, offset + 64 * 1024);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(part.length);
          socket.write(size);
          socket.write(part);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}
