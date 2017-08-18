/*
    @description: 'gooddogapi' Stream plugin.
    @author: Jesse Hemingway
 */

'use strict';

const Stream = require('stream');
const Os = require('os');
const Wreck = require('wreck');
const Stringify = require('fast-safe-stringify');


// Declare internals

const internals = {
    defaults: {
        schema: 'good-dog-api',
        endpoint: 'https://app.datadoghq.com/api/v1',
        apiKey: 12345,
        appKey: 67890,
        prefix: '',
        prefixMethodToRoute: true,
        wreck: {
            timeout: 15000,
            headers: {}
        },
        threshold: 20,
        errorThreshold: 0
    },
    host: Os.hostname()
};

/*
 Declares the 'gooddogapi' Stream extension.
 */
class GoodDogApi extends Stream.Writable {

    constructor(config) {

        config = config || {};
        const settings = Object.assign({}, internals.defaults, config);

        if (settings.errorThreshold === null) {
            settings.errorThreshold = -Infinity;
        }

        super({ objectMode: true, decodeStrings: false });
        this._settings = settings;
        this._data = [];
        this._failureCount = 0;

        // Standard users
        this.once('finish', () => {

            this._sendMessages();
        });
    }

    _write(data, encoding, callback) {

        this._data.push(data);
        if (this._data.length >= this._settings.threshold) {
            this._sendMessages((err) => {

                if (err && this._failureCount < this._settings.errorThreshold) {
                    this._failureCount++;
                    return callback();
                }

                this._data = [];
                this._failureCount = 0;

                return callback(this._settings.errorThreshold !== -Infinity && err);
            });
        }
        else {
            setImmediate(callback);
        }
    }

    _sendMessages(callback) {

        const series = this._extractOpsSeries().concat(this._extractResponseSeries());
        if (!series.length) {
            return callback()
        }
        const envelope = { series: series };

        const wreckOptions = Object.assign({}, this._settings.wreck, {
            payload: Stringify(envelope),
            headers: {
                'content-type': 'application/json'
            }
        });

        const url = `${this._settings.endpoint}/series?api_key=${this._settings.apiKey}&application_key=${this._settings.appKey}`;

        Wreck.request('post', url, wreckOptions, (err, response) => {
            callback(err, response);
        });
    }

    _extractOpsSeries() {
        const load1 = { metric: this._settings.prefix + 'load.1', points: [], host: internals.host };
        const load5 = { metric: this._settings.prefix + 'load.5', points: [], host: internals.host };
        const load15 = { metric: this._settings.prefix + 'load.15', points: [], host: internals.host };
        const rss = { metric: this._settings.prefix + 'mem.rss', points: [], host: internals.host };
        const heapTotal = { metric: this._settings.prefix + 'mem.heapTotal', points: [], host: internals.host };
        const heapFree = { metric: this._settings.prefix + 'mem.heapFree', points: [], host: internals.host };

        const responseTimeAvg = { metric: this._settings.prefix + 'net.response.avg', points: [], host: internals.host };
        const responseTimeMax = { metric: this._settings.prefix + 'net.response.max', points: [], host: internals.host };

        for (let message of this._data) {
            if (message.event !== 'ops') {
                continue;
            }

            const timestamp = Math.round(message.timestamp / 1000);

            load1.points.push([timestamp, message.os.load[0]]);
            load5.points.push([timestamp, message.os.load[1]]);
            load15.points.push([timestamp, message.os.load[2]]);
            if (message.proc.mem.rss) {
                rss.points.push([timestamp, message.proc.mem.rss]);
            }
            if (message.proc.mem.heapTotal) {
                heapTotal.points.push([timestamp, message.proc.mem.heapTotal]);
            }
            if (message.proc.mem.heapFree) {
                heapFree.points.push([timestamp, message.proc.mem.heapFree]);
            }

            // aggregate response avg/max over all ports
            let ports = Object.keys(message.load.responseTimes);
            if (ports.length) {
                let avg = 0;
                let max = 0;
                for (let port of ports) {
                    const metrics = message.load.responseTimes[port];
                    if (!isNaN(metrics.avg)) {
                        avg += metrics.avg;
                    }
                    max = Math.max(max, metrics.max);
                }
                avg /= ports.length;
                responseTimeAvg.points.push([timestamp, avg]);
                responseTimeMax.points.push([timestamp, max]);
            }
        }

        if (load1.points.length) {
            return [load1, load5, load15, rss, heapTotal, heapFree, responseTimeAvg, responseTimeMax];
        }
        return [];
    }

    _extractResponseSeries () {
        const series = [];

        for (let message of this._data) {
            if (message.event !== 'response' || message.responseSentTime === undefined) {
                continue;
            }

            const timestamp = Math.round(message.timestamp / 1000);
            const metricTags = [];

            if (this._settings.prefixMethodToRoute) {
                if (message.route) {
                    const method = message.method || 'any';
                    metricTags.push(`route:${method} ${message.route}`);
                }
            } else {
                if (message.route) {
                    metricTags.push(`route:${message.route}`);
                }
                if (message.method) {
                    metricTags.push(`method:${message.method}`);
                }
            }

            if (message.statusCode) {
                metricTags.push(`status:${message.statusCode}`);
            }

            series.push({ metric: this._settings.prefix + 'net.response.route', points: [[timestamp, message.responseSentTime]], host: internals.host, tags: metricTags });
        }

        return series;
    }
}


module.exports = GoodDogApi;
