"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomAPI = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const constructs_1 = require("constructs");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const NodejsFunction_1 = require("./NodejsFunction");
const HttpMethod = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE',
    PATCH: 'PATCH',
    OPTIONS: 'OPTIONS',
    HEAD: 'HEAD',
};
const defaultAuthorizer = 'default-authorizer';
;
;
;
/**
 * Returns the api folder path in the tsBuildOutputFolder if ENV is "local" otherwise in the sourcePath.
 * @param props
 * @returns
 */
function getApiFolderPath(props) {
    if (props.environment.ENV === 'local') {
        if (!props.tsBuildOutputFolder) {
            throw new Error('tsBuildOutputFolder is required when ENV is "local"');
        }
        return props.tsBuildOutputFolder;
    }
    return props.sourcePath;
}
/**
 * Returns the config from the config.ts in the given directory.
 * If we are in localstack mode, and the config.ts file does not exist, try to load the config.js file.
 * @param directory
 * @returns
 */
function getConfigFromPath(directory, props) {
    return __awaiter(this, void 0, void 0, function* () {
        let configPath = path.join(directory, `config.${props.environment.ENV === 'local' ? 'js' : 'ts'}`);
        if (!fs.existsSync(configPath)) {
            return undefined;
        }
        const { config } = yield Promise.resolve(`${configPath}`).then(s => __importStar(require(s)));
        return config;
    });
}
function throwIfAuthorizerNotFound(apiFolderPath, authorizerName, props) {
    const authorizerPath = path.join(apiFolderPath, `${authorizerName}.${props.environment.ENV === 'local' ? 'js' : 'ts'}`);
    if (!fs.existsSync(authorizerPath)) {
        throw new Error(`Authorizer ${authorizerName} not found in ${apiFolderPath}`);
    }
}
class CustomAPI extends constructs_1.Construct {
    ;
    constructor(scope, id, props) {
        var _a, _b, _c, _d, _e;
        super(scope, id);
        this.authorizers = {};
        this.lambdas = {};
        this.traverse = (currentPath_1, currentNode_1, props_1, ...args_1) => __awaiter(this, [currentPath_1, currentNode_1, props_1, ...args_1], void 0, function* (currentPath, currentNode, props, parentName = '') {
            const entries = fs.readdirSync(currentPath);
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry);
                if (fs.statSync(fullPath).isDirectory()) {
                    const resource = currentNode.resource.addResource(entry);
                    const isIdRoute = entry === '{id}';
                    const routeName = isIdRoute ? `${parentName}_id` : entry;
                    currentNode.routes[entry] = {
                        routes: {},
                        methods: {},
                        resource
                    };
                    const config = yield getConfigFromPath(fullPath, props);
                    if (config === null || config === void 0 ? void 0 : config.methods) {
                        for (const method in config.methods) {
                            const methodName = `${routeName}_${method}`;
                            currentNode.routes[entry].methods[method] = this.addMethod(method, resource, fullPath, config.methods[method], methodName, props);
                        }
                    }
                    yield this.traverse(fullPath, currentNode.routes[entry], props, routeName);
                }
            }
            ;
        });
        this.addMethod = (type, resource, pathToMethod, config, methodName, props) => __awaiter(this, void 0, void 0, function* () {
            var _f;
            const relativePathToMethod = pathToMethod.substring(props.sourcePath.length + 1); /* +1 to remove leading / */
            const method = NodejsFunction_1.NodejsFunction.generate(this, `${methodName}Function`, Object.assign(Object.assign(Object.assign({ runtime: lambda.Runtime.NODEJS_18_X, environment: this.environment, functionName: `${cdk.Stack.of(this).stackName}-${methodName}`, logGroup: new cdk.aws_logs.LogGroup(this, `${methodName}LogGroup`, {
                    logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-${methodName}`,
                    retention: cdk.aws_logs.RetentionDays.ONE_YEAR
                }), timeout: cdk.Duration.seconds(30), memorySize: this.lambdaMemorySize }, props.functionProps), config.functionProps), { tsBuildOutputFolder: props.tsBuildOutputFolder, sourcePath: props.sourcePath, relativePathToHandler: path.join(relativePathToMethod, `${type.toLowerCase()}.ts`) }));
            this.lambdas[methodName.toLowerCase()] = method;
            let requestModels, requestParameters;
            if (config.model) {
                switch (type) {
                    case HttpMethod.GET:
                        requestParameters = config.model.requestParameters;
                        break;
                    case HttpMethod.POST:
                        requestModels = {
                            [config.model.contentType]: new cdk.aws_apigateway.Model(this, `${methodName}RequestModel`, {
                                restApi: resource.api,
                                contentType: config.model.contentType,
                                schema: config.model.schema
                            })
                        };
                        break;
                }
            }
            /**
             * Gets the permissions provided in the methods config file and assigns them to the methods lambda.
             * It loops through the resources and maps any placeholder names to the resources passed in via the api props
             */
            if (config.policies) {
                for (const policy of config.policies) {
                    const resources = [];
                    if (props.permissionResourceMapping) {
                        for (const resource of policy.resources) {
                            resources.push((_f = props.permissionResourceMapping[resource]) !== null && _f !== void 0 ? _f : resource);
                        }
                    }
                    method.addToRolePolicy(new iam.PolicyStatement({
                        actions: policy.actions,
                        resources: resources
                    }));
                }
            }
            let authorizer = undefined;
            const authorizerName = config.authorizer || defaultAuthorizer;
            if (this.authorizers[authorizerName]) {
                authorizer = this.authorizers[authorizerName];
            }
            else {
                const apiFolderPath = getApiFolderPath(props);
                throwIfAuthorizerNotFound(apiFolderPath, authorizerName, props);
                const lambdaAuthorizer = NodejsFunction_1.NodejsFunction.generate(this, `${props.apiName}Lambda${authorizerName}`, {
                    runtime: lambda.Runtime.NODEJS_18_X,
                    functionName: `${cdk.Stack.of(this).stackName}-${authorizerName}`,
                    logGroup: new cdk.aws_logs.LogGroup(this, `${props.apiName}Lambda${authorizerName}LogGroup`, {
                        logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-${authorizerName}`,
                        retention: cdk.aws_logs.RetentionDays.ONE_YEAR
                    }),
                    environment: this.environment,
                    memorySize: this.authorizerMemorySize,
                    tsBuildOutputFolder: props.tsBuildOutputFolder,
                    sourcePath: props.sourcePath,
                    relativePathToHandler: `${authorizerName}.ts`
                });
                authorizer = new cdk.aws_apigateway.RequestAuthorizer(this, `${props.apiName}${authorizerName}`, {
                    handler: lambdaAuthorizer,
                    identitySources: [cdk.aws_apigateway.IdentitySource.header('Authorization')],
                    resultsCacheTtl: cdk.Duration.seconds(0)
                });
                authorizer._attachToApi(resource.api);
                this.authorizers[authorizerName] = authorizer;
            }
            resource.addMethod(type, new cdk.aws_apigateway.LambdaIntegration(method), {
                requestValidatorOptions: {
                    validateRequestBody: type === 'POST',
                    validateRequestParameters: type === 'GET'
                },
                requestModels,
                requestParameters,
                authorizer: config.authRequired ? authorizer : undefined
            });
        });
        this.pathToCamelCase = (path) => {
            return path.replace(/^\/|\/$/g, '').split('/').map((s, i) => i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)).join('');
        };
        this.environment = props.environment;
        this.clientHostUrl = (_a = props.clientHostUrl) !== null && _a !== void 0 ? _a : '*';
        this.lambdaMemorySize = (_b = props.lambdaMemorySize) !== null && _b !== void 0 ? _b : 128;
        this.authorizerMemorySize = (_c = props.authorizerMemorySize) !== null && _c !== void 0 ? _c : 128;
        this.waitForLambdasReady = new Promise((resolve) => {
            this.onLambdasReadyResolve = resolve;
        });
        /**
         * @deprecated use waitForLambdasReady instead
         */
        this.lambdasReady = new Promise((resolve) => {
            this.lambdasReadyResolve = resolve;
        });
        if (props.environment.ENV === 'local') {
            this.localstackHotReloadBucket = cdk.aws_s3.Bucket.fromBucketName(this, 'HotReloadBucket', 'hot-reload');
        }
        let domainName = undefined;
        if (props.domainConfig) {
            domainName = {
                domainName: `api.${props.domainConfig.name}`,
                certificate: props.domainConfig.certificate,
                endpointType: cdk.aws_apigateway.EndpointType.EDGE,
                securityPolicy: cdk.aws_apigateway.SecurityPolicy.TLS_1_2
            };
        }
        const gatewayOptions = (_d = props.deployOptions) !== null && _d !== void 0 ? _d : {};
        const api = new cdk.aws_apigateway.RestApi(this, `${props.apiName}API`, Object.assign({ domainName, defaultCorsPreflightOptions: {
                allowOrigins: [this.clientHostUrl],
                allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Accept',
                    'Authorization',
                    'Content-Type',
                    'Origin',
                    'User-Agent',
                    'Content-Encoding',
                    'Salesforce-Instance-Url'
                ]
            } }, gatewayOptions));
        api.addGatewayResponse('ForbiddenResponse', {
            type: cdk.aws_apigateway.ResponseType.ACCESS_DENIED,
            statusCode: '403',
            responseHeaders: {
                'Access-Control-Allow-Origin': `'${this.clientHostUrl}'`,
                'Access-Control-Allow-Credentials': '\'true\''
            },
            templates: {
                'application/json': '{ "message": "$context.authorizer.errorMessage" }'
            }
        });
        api.addGatewayResponse('UnauthorizedResponse', {
            type: cdk.aws_apigateway.ResponseType.ACCESS_DENIED,
            statusCode: '401',
            responseHeaders: {
                'Access-Control-Allow-Origin': `'${this.clientHostUrl}'`,
                'Access-Control-Allow-Credentials': '\'true\''
            },
            templates: {
                'application/json': '{ "message": "$context.authorizer.errorMessage" }'
            }
        });
        api.addGatewayResponse('InternalServerErrorResponse', {
            type: cdk.aws_apigateway.ResponseType.DEFAULT_5XX,
            statusCode: '500',
            responseHeaders: {
                'Access-Control-Allow-Origin': `'${this.clientHostUrl}'`,
                'Access-Control-Allow-Credentials': '\'true\''
            },
            templates: {
                'application/json': '{ "message": "Internal Server Error" }'
            }
        });
        this.apiGateway = api;
        if (props.domainConfig) {
            const zone = route53.HostedZone.fromLookup(this, `${props.apiName}DomainZone`, { domainName: (_e = props.domainConfig.baseName) !== null && _e !== void 0 ? _e : props.domainConfig.name });
            new route53.ARecord(this, `${props.apiName}APIRecord`, {
                zone: zone,
                recordName: `api.${props.domainConfig.name}`,
                target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
            });
        }
        const routes = {
            routes: {},
            methods: {},
            resource: api.root
        };
        this.traverse(getApiFolderPath(props), routes, props).then(() => {
            this.onLambdasReadyResolve(this.lambdas);
            this.lambdasReadyResolve();
        });
    }
}
exports.CustomAPI = CustomAPI;
//# sourceMappingURL=ConvertPathToApi.js.map