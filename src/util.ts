import { Readable } from 'stream';
import * as tar from 'tar-stream';
import gunzip from 'gunzip-maybe';
import * as transliteration from 'transliteration';

//import { config } from './config';

/*
 * add website (and eventually signature) to a logo URL
 *
 * LATER: this should take a 'source' parameter
 */
function expandUrl(url:string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    return url; //LATER: expand with source data
}

function getCurrentIP(ctx:any):string {
    return ctx.ips.length > 0 ? ctx.ips[0] : ctx.ip;
}

function getFirst(value: string | string[] | undefined): string|undefined {

    if (!value) {
        return value;
    }

    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

function processTar(tarStream: Readable, callback: (name:string, buf: Buffer|null) => void ):void {

    var extract = tar.extract()

    extract.on('entry', function (header, stream, next) {
        // header is the tar header
        // stream is the content body (might be an empty stream)
        // call next when you are done with this entry
        streamToBuffer(stream).then((buf) => {
            callback(header.name, buf);
            next();
        });

        stream.on('end', function () {
            next() // ready for next entry
        })

        stream.resume() // just auto drain the stream
    })

    extract.on('finish', function () {
        // all entries read
        callback('EOF', null);
    })

    tarStream.pipe(gunzip()).pipe(extract);
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
    let onData: (data: Buffer) => void;
    let onError: (error: Error) => void;
    let onEnd: () => void;
    return new Promise<Buffer[]>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('end', (onEnd = () => resolve(chunks)));
        stream.on('error', (onError = reject));
        // adding a 'data' listener switches the stream to flowing mode
        stream.on('data', (onData = (data: Buffer) => chunks.push(data)));
    })
        .then(Buffer.concat)
        .finally(() => {
            stream.removeListener('data', onData);
            stream.removeListener('error', onError);
            stream.removeListener('end', onEnd);
        });
}

const prefixesToTrim:Set<string> = new Set([
    'de',
    'del',
    'du',
    'la',
    'logo',
    'logotip',
    'logotipo',
    'logotyp',
    'logotype',
    'of',
    'the',
]);

const suffixesToTrim:Set<string> = new Set([
    '',
    '1', '2', '3', '4', '5', '6', '7', '8', '9',    //LATER: maybe regex check instead?
    'alt',
    'black',
    'color',
    'dark',
    'default',
    'horizontal',
    'icon',
    'light',
    'lockup',
    'logo',
    'official',
    'old',
    'original',
    'padded',
    'plain',
    'rect',
    'simple',
    'small',
    'sq', 'square',
    'st',
    'symbol',
    'tile',
    'type',
    'vertical',
    'white',
    'wordmark',
]);

function slugify(target:string, separator:string):string {
    //LATER: any other transforms needed?
    const svgName = extractFileName(target);
    const name = svgName.endsWith('.svg') ? svgName.slice(0, -4) : svgName;
    const pureName = transliteration.slugify(name, {
        allowedChars: 'a-zA-Z0-9',
        lowercase: true,
        trim: true,
    })
    const parts = pureName.split('-');
    while (parts.length > 1 && suffixesToTrim.has(parts[parts.length - 1])) {
        parts.pop();
    }

    while (parts.length > 1 && prefixesToTrim.has(parts[0])) {
        parts.shift();
    }

    return parts.join(separator);
}

function extractFileName(imgpath:string):string {
    const lastpart = imgpath.split('/').pop();
    if (!lastpart) {
        return imgpath;
    }
    return lastpart;
}
function getJsonp(ctx:any):string|null {
    const callback = ctx.request.query['callback'];
    if (!callback) {
      return null;
    }

    if (callback.match(/^[$A-Za-z_][0-9A-Za-z_$]*$/) != null) {
      return callback;
    }
    return null;
}

function handleJsonp(ctx:any, retVal:any) {
    const callback = getJsonp(ctx);
    retVal.license = 'Free for light, non-commercial use';
    const jsonStr = ctx.query && ctx.query.pretty ? JSON.stringify(retVal, null, 2) : JSON.stringify(retVal);
    if (callback) {
        ctx.body = callback + '(' + jsonStr + ');';
        ctx.set('Content-Type', 'text/javascript');
    } else {
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Methods', 'POST, GET');
        ctx.set('Access-Control-Max-Age', '604800');
        ctx.body = jsonStr;
        ctx.set('Content-Type', 'application/json; charset=utf-8');
    }
}

function safeParseInt(str:string, def: number):number {
    const parsed = parseInt(str, 10);
    if (isNaN(parsed)) {
        return def;
    }
    return parsed;
}

function toBoolean(value: any): boolean {

    switch (value) {
        case true:
        case "true":
        case 1:
        case "1":
        case "on":
        case "yes":
            return true;
        default:
            return false;
    }
}

export {
    expandUrl,
    getCurrentIP,
    getFirst,
    handleJsonp,
    processTar,
    safeParseInt,
    slugify,
    streamToBuffer,
    toBoolean,
}
