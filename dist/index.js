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
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const nodejsLambda = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
const constructs_1 = require("constructs");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
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
 * Returns the api folder path based on the isLocalStack flag.
 * @param props
 * @returns
 */
function getApiFolderPath(props) {
    if (props.isLocalStack) {
        if (!props.tsApiOutputFolder) {
            throw new Error('tsApiOutputFolder is required when isLocalStack is true');
        }
        return props.tsApiOutputFolder;
    }
    return props.apiFolderPath;
}
/**
 * Returns the config from the config.ts in the given directory.
 * If we are in localstack mode, and the config.ts file does not exist, try to load the config.js file.
 * @param directory
 * @returns
 */
function getConfigFromPath(directory, props) {
    return __awaiter(this, void 0, void 0, function* () {
        let configPath = path.join(directory, `config.${props.isLocalStack ? 'js' : 'ts'}`);
        if (!fs.existsSync(configPath)) {
            return undefined;
        }
        const { config } = yield Promise.resolve(`${configPath}`).then(s => __importStar(require(s)));
        return config;
    });
}
function throwIfAuthorizerNotFound(apiFolderPath, authorizerName, props) {
    const authorizerPath = path.join(apiFolderPath, `${authorizerName}.${props.isLocalStack ? 'js' : 'ts'}`);
    if (!fs.existsSync(authorizerPath)) {
        throw new Error(`Authorizer ${authorizerName} not found in ${apiFolderPath}`);
    }
}
class CustomAPI extends constructs_1.Construct {
    constructor(scope, id, props) {
        var _a, _b, _c, _d, _e;
        super(scope, id);
        this.authorizers = {};
        this.lambdas = {};
        /**
         * Returns the lambda entry point.
         * If we are in localstack mode, we need to use the tsBaseOutputFolder and the handler will be the entry point.ts file.
         * This allows for hot reloading and ensures that code above the api base folder is available for import
         * If we are not in localstack mode, we can use the path to the method.
         * @param props
         * @param pathToMethod
         * @param entryPoint
         * @returns
         */
        this.getLambdaEntryPoint = (props, pathToMethod, entryPoint) => {
            if (props.isLocalStack) {
                if (!props.tsBaseOutputFolder) {
                    throw new Error('tsBaseOutputFolder is required when isLocalStack is true');
                }
                return {
                    code: cdk.aws_lambda.Code.fromBucket(this.localstackHotReloadBucket, props.tsBaseOutputFolder),
                    handler: path.join(pathToMethod.substring(props.tsBaseOutputFolder.length + 1 /* +1 to remove leading / */), `${entryPoint}.handler`),
                };
            }
            else {
                return {
                    entry: path.join(pathToMethod, `${entryPoint}.ts`),
                };
            }
        };
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
            if (props.isLocalStack && !props.tsBaseOutputFolder) {
                throw new Error('tsBaseOutputFolder is required when isLocalStack is true');
            }
            let methodProps = Object.assign(Object.assign(Object.assign({ runtime: lambda.Runtime.NODEJS_18_X, environment: this.environment, role: this.adminRole, logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH, functionName: `${cdk.Stack.of(this).stackName}-${methodName}`, timeout: cdk.Duration.seconds(30), memorySize: this.lambdaMemorySize }, props.functionProps), config.functionProps), this.getLambdaEntryPoint(props, pathToMethod, type.toLowerCase()));
            const method = new nodejsLambda.NodejsFunction(this, `${methodName}Function`, methodProps);
            this.lambdas[methodName] = method;
            let requestModels, requestParameters;
            if (config.model) {
                switch (type) {
                    case HttpMethod.GET:
                        requestParameters = config.model.requestParameters;
                        break;
                    case HttpMethod.POST:
                        requestModels = {
                            [config.model.contentType]: new apigateway.Model(this, `${methodName}RequestModel`, {
                                restApi: resource.api,
                                contentType: config.model.contentType,
                                schema: config.model.schema
                            })
                        };
                        break;
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
                let authorizerProps = Object.assign({ runtime: lambda.Runtime.NODEJS_18_X, functionName: `${cdk.Stack.of(this).stackName}-${authorizerName}`, logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH, environment: this.environment, memorySize: this.authorizerMemorySize }, this.getLambdaEntryPoint(props, apiFolderPath, authorizerName));
                const lambdaAuthorizer = new nodejsLambda.NodejsFunction(this, `${props.apiName}Lambda${authorizerName}`, authorizerProps);
                authorizer = new apigateway.RequestAuthorizer(this, `${props.apiName}${authorizerName}`, {
                    handler: lambdaAuthorizer,
                    identitySources: [apigateway.IdentitySource.header('Authorization')],
                    resultsCacheTtl: cdk.Duration.seconds(0)
                });
                authorizer._attachToApi(resource.api);
                this.authorizers[authorizerName] = authorizer;
            }
            resource.addMethod(type, new apigateway.LambdaIntegration(method), {
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
        this.lambdasReady = new Promise((resolve) => {
            this.lambdasReadyResolve = resolve;
        });
        this.adminRole = new iam.Role(this, 'AdminRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
            ],
        });
        if (props.isLocalStack) {
            this.localstackHotReloadBucket = cdk.aws_s3.Bucket.fromBucketName(this, 'HotReloadBucket', 'hot-reload');
        }
        let domainName = undefined;
        if (props.domainConfig) {
            domainName = {
                domainName: `api.${props.domainConfig.name}`,
                certificate: props.domainConfig.certificate,
                endpointType: apigateway.EndpointType.EDGE,
                securityPolicy: apigateway.SecurityPolicy.TLS_1_2
            };
        }
        const gatewayOptions = (_d = props.deployOptions) !== null && _d !== void 0 ? _d : {};
        const api = new apigateway.RestApi(this, `${props.apiName}API`, Object.assign({ domainName, defaultCorsPreflightOptions: {
                allowOrigins: [this.clientHostUrl],
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Accept',
                    'Authorization',
                    'Content-Type',
                    'Origin',
                    'User-Agent',
                    'Content-Type',
                    'Salesforce-Instance-Url'
                ]
            } }, gatewayOptions));
        api.addGatewayResponse('ForbiddenResponse', {
            type: apigateway.ResponseType.ACCESS_DENIED,
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
            type: apigateway.ResponseType.ACCESS_DENIED,
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
            type: apigateway.ResponseType.DEFAULT_5XX,
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
            this.lambdasReadyResolve();
        });
    }
}
exports.CustomAPI = CustomAPI;
