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
;
;
;
class CustomAPI extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.addMethod = (type, resource, pathToMethod, config, entry) => __awaiter(this, void 0, void 0, function* () {
            const name = (entry + type).replace(/{|}/g, '_');
            const method = new nodejsLambda.NodejsFunction(this, `${name}Function`, {
                runtime: lambda.Runtime.NODEJS_18_X,
                entry: path.join(pathToMethod, `${type.toLowerCase()}.ts`),
                environment: this.environment,
                role: this.adminRole,
                logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
                functionName: `${cdk.Stack.of(this).stackName}-${name}`,
                timeout: cdk.Duration.seconds(30)
            });
            let requestModels, requestParameters;
            if (config.model) {
                switch (type) {
                    case HttpMethod.GET:
                        requestParameters = config.model.requestParameters;
                        break;
                    case HttpMethod.POST:
                        requestModels = {
                            [config.model.contentType]: new apigateway.Model(this, `${name}RequestModel`, {
                                restApi: resource.api,
                                contentType: config.model.contentType,
                                schema: config.model.schema
                            })
                        };
                        break;
                }
            }
            resource.addMethod(type, new apigateway.LambdaIntegration(method), {
                requestValidatorOptions: {
                    validateRequestBody: type === 'POST',
                    validateRequestParameters: type === 'GET'
                },
                requestModels,
                requestParameters,
                authorizer: config.authRequired ? this.authorizer : undefined
            });
        });
        this.pathToCamelCase = (path) => {
            return path.replace(/^\/|\/$/g, '').split('/').map((s, i) => i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)).join('');
        };
        this.environment = props.environment;
        this.adminRole = new iam.Role(this, 'AdminRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
            ],
        });
        let domainName = undefined;
        if (this.environment.ENV !== 'local') {
            domainName = {
                domainName: `api.${this.environment.DOMAIN}`,
                certificate: props.certificate,
                endpointType: apigateway.EndpointType.EDGE,
                securityPolicy: apigateway.SecurityPolicy.TLS_1_2
            };
        }
        const api = new apigateway.RestApi(this, 'ApplicationPortalAPI', {
            domainName,
            defaultCorsPreflightOptions: {
                allowOrigins: [this.environment.CLIENT_HOST_URL],
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
            }
        });
        api.addGatewayResponse('ForbiddenResponse', {
            type: apigateway.ResponseType.ACCESS_DENIED,
            statusCode: '403',
            responseHeaders: {
                'Access-Control-Allow-Origin': `'${this.environment.CLIENT_HOST_URL}'`,
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
                'Access-Control-Allow-Origin': `'${this.environment.CLIENT_HOST_URL}'`,
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
                'Access-Control-Allow-Origin': `'${this.environment.CLIENT_HOST_URL}'`,
                'Access-Control-Allow-Credentials': '\'true\''
            },
            templates: {
                'application/json': '{ "message": "Internal Server Error" }'
            }
        });
        if (this.environment.ENV !== 'local') {
            const zone = route53.HostedZone.fromLookup(this, 'ApplicationPortalDomainZone', { domainName: this.environment.DOMAIN });
            new route53.ARecord(this, 'ApplicationPortalAPIRecord', {
                zone: zone,
                recordName: `api.${this.environment.DOMAIN}`,
                target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
            });
        }
        const lambdaAuthorizer = new nodejsLambda.NodejsFunction(this, 'ApplicationPortalLambdaAuthorizer', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, `${props.apiFolderPath}/authorizer.ts`),
            functionName: `${cdk.Stack.of(this).stackName}-authorizer`,
            logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
            environment: this.environment,
        });
        this.authorizer = new apigateway.RequestAuthorizer(this, 'ApplicationPortalAuthorizer', {
            handler: lambdaAuthorizer,
            identitySources: [apigateway.IdentitySource.header('Authorization')],
            resultsCacheTtl: this.environment.ENV === 'local' ? cdk.Duration.seconds(0) : undefined
        });
        this.authorizer._attachToApi(api);
        const routes = {
            routes: {},
            methods: {},
            resource: api.root
        };
        const traverse = (currentPath, currentNode) => __awaiter(this, void 0, void 0, function* () {
            const entries = fs.readdirSync(currentPath);
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const fullPath = path.join(currentPath, entry);
                if (fs.statSync(fullPath).isDirectory()) {
                    const resource = currentNode.resource.addResource(entry);
                    currentNode.routes[entry] = {
                        routes: {},
                        methods: {},
                        resource
                    };
                    const configPath = path.join(fullPath, 'config.ts');
                    if (fs.existsSync(configPath)) {
                        const { config } = yield Promise.resolve(`${configPath}`).then(s => __importStar(require(s)));
                        if (config.methods) {
                            for (const method in config.methods) {
                                currentNode.routes[entry].methods[method] = this.addMethod(method, resource, fullPath, config.methods[method], entry);
                            }
                        }
                    }
                    traverse(fullPath, currentNode.routes[entry]);
                }
            }
            ;
        });
        traverse(path.join(__dirname, props.apiFolderPath), routes);
    }
}
exports.CustomAPI = CustomAPI;
