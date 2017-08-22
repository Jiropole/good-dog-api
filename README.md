# To use 

Import **good-dog-api.js**. 

### Examples with Confidence and Glue

These examples use a declarative approach to Hapi server configuration based on [Confidence](https://github.com/hapijs/confidence) and [Glue](https://github.com/hapijs/glue).

Typical options:

```
const dataDogReporter = [
    {
        module: require('../server/good-dog-api'),
        args: [{
            apiKey: process.env.DATADOG_API_CLIENT,
            appKey: process.env.DATADOG_APP_CLIENT,
            prefix: '<myapp>.',
            threshold: 20,		// message queue length
            errorThreshold: 5	// message retry threshold
        }]
    }
];
```

In production, report Good ops and requests to Datadog:

```
const goodPluginConfigProd = {
    plugin: {
        register: 'good',
        options: {
            ops: {
                interval: 5000
            },
            reporters: {
                dataDog: dataDogReporter
            }
        }
    }
};
```

In development, report Good requests to console:

```
const goodPluginConfigDev = {
    plugin: {
        register: 'good',
        options: {
            ops: {
                interval: 10 * 60 * 1000
            },
            reporters: {
                console: consoleReporter
            }
        }
    }
};
```

Examples of conditional selection of Good configuration (with Confidence, and Blip included for comparison):

```
    extraPlugins: {
    	$filter: 'env',
        development: {
            true: [blipPluginConfig, goodPluginConfigDev],
            $default: [blipPluginConfig]
        },
        production: {
            true: [goodPluginConfigProd]
        }
    }
```

## TODO:

* Better documentation
* More examples
* NPM Module
