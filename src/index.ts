import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

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

export interface methodConfig {
  methods: {
    [method: string]: {
      authRequired: boolean;
      authorizer?: string;
      model: any;
      methodResponses?: any;
    };
  };
};

interface apiRoute {
  routes: {[name: string]: apiRoute},
  methods: {[method: string]: any},
  resource: apigateway.IResource
};

interface domainConfig {
  baseName?: string; // Used when base domain already exists, and name is a subdomain. Otherwise leave empty.
  name: string;
  certificate: cdk.aws_certificatemanager.Certificate;
}

export interface apiProps {
  apiName: string;
  apiFolderPath: string;
  clientHostUrl?: string;
  environment?: { [key: string]: string },
  domainConfig?: domainConfig
  deployOptions?: apigateway.RestApiProps;
  lambdaMemorySize?: number;
  authorizerMemorySize?: number;
  functionProps?: nodejsLambda.NodejsFunctionProps;
  cognitoUserPool?: cognito.UserPool;
};

export class CustomAPI extends Construct {
  authorizers: { [key: string]: apigateway.RequestAuthorizer | apigateway.CognitoUserPoolsAuthorizer } = {};
  lambdas: { [key: string]: lambda.Function } = {};
  environment?: { [key: string]: string };
  clientHostUrl?: string;
  adminRole: iam.Role;
  lambdaMemorySize: number;
  authorizerMemorySize: number;
  apiGateway: cdk.aws_apigateway.RestApi;
  lambdasReady: Promise<void>;

  private lambdasReadyResolve: () => void;

  constructor(scope: Construct, id: string, props: apiProps) {
    super(scope, id);
    this.environment = props.environment;
    this.clientHostUrl = props.clientHostUrl ?? '*';
    this.lambdaMemorySize = props.lambdaMemorySize ?? 128;
    this.authorizerMemorySize = props.authorizerMemorySize ?? 128;

    this.lambdasReady = new Promise<void>((resolve) => {
      this.lambdasReadyResolve = resolve;
    });

    this.adminRole = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    let domainName = undefined;
    if (props.domainConfig) {
      domainName = {
        domainName: `api.${props.domainConfig.name}`,
        certificate: props.domainConfig.certificate,
        endpointType: apigateway.EndpointType.EDGE,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2
      }
    }

    const gatewayOptions = props.deployOptions ?? {};

    const api = new apigateway.RestApi(this, `${props.apiName}API`, {
      domainName,
      defaultCorsPreflightOptions: {
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
      },
      ...gatewayOptions
    });

    api.addGatewayResponse('BadRequestBody', {
      type: apigateway.ResponseType.BAD_REQUEST_BODY,
      statusCode: '400',
      responseHeaders: {
        'Access-Control-Allow-Origin': `'${this.clientHostUrl}'`,
        'Access-Control-Allow-Credentials': '\'true\''
      },
      templates: {
        'application/json': '{ "message": "$context.error.messageString", "missingFields": "$context.error.validationErrorString" }',
      }
    });

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
      const zone = route53.HostedZone.fromLookup(this, `${props.apiName}DomainZone`, { domainName: props.domainConfig.baseName ?? props.domainConfig.name });

      new route53.ARecord(this, `${props.apiName}APIRecord`, {
        zone: zone,
        recordName: `api.${props.domainConfig.name}`,
        target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
      });
    }
    
    const routes: apiRoute = {
      routes: {},
      methods: {},
      resource: api.root
    };
  
    this.traverse(props.apiFolderPath, routes, props).then(() => {
      this.lambdasReadyResolve();
    });
  }

  traverse = async (currentPath: string, currentNode: apiRoute, props:apiProps, parentName: string = '') => {
    const entries = fs.readdirSync(currentPath);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
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

        const configPath = path.join(fullPath, 'config.ts');
        if (fs.existsSync(configPath)) {
          const { config } = await import(configPath);

          if (config.methods) {
            for(const method in config.methods) {
              const methodName = `${routeName}_${method}`;
              currentNode.routes[entry].methods[method] = this.addMethod(method, resource, fullPath, config.methods[method], methodName, props);
            }
          }
        }
        
        await this.traverse(fullPath, currentNode.routes[entry], props, routeName);
      }
    };
  }

  addMethod = async (type: string, resource: apigateway.IResource, pathToMethod: string, config: any, methodName: string, props: apiProps) => {
    const method = new nodejsLambda.NodejsFunction(this, `${methodName}Function`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(pathToMethod, `${type.toLowerCase()}.ts`),
      environment: this.environment,
      role: this.adminRole,
      logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
      functionName: `${cdk.Stack.of(this).stackName}-${methodName}`,
      timeout: cdk.Duration.seconds(30),
      memorySize: this.lambdaMemorySize,
      ...props.functionProps,
      ...config.functionProps
    });

    this.lambdas[methodName] = method;

    let requestModels, requestParameters;

    if (config.model) {
      switch(type) {
        case HttpMethod.GET:
          requestParameters = config.model.requestParameters;
          break;
        case HttpMethod.POST:
          requestModels = {
            [config.model.contentType]: new apigateway.Model(
              this, 
              `${methodName}RequestModel`, 
              { 
                restApi: resource.api, 
                contentType: config.model.contentType, 
                schema: config.model.schema 
              }
            )
          }
          break;
      }
    }

    let authorizer = undefined;
    const authorizerName = config.authorizer || defaultAuthorizer;
    
    if (this.authorizers[authorizerName]) {
      authorizer = this.authorizers[authorizerName]
    } else if (authorizerName === 'COGNITO') {
      if (!props.cognitoUserPool) {
        throw new Error('Cognito User Pool not provided, yet was specified as authorizer for a method');
      }
      authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, `${props.apiName}CognitoAuthorizer`, {
        cognitoUserPools: [props.cognitoUserPool],
      });
      this.authorizers[authorizerName] = authorizer;
    }
    else {
      if (!fs.existsSync(`${props.apiFolderPath}/${authorizerName}.ts`)) {
        throw new Error(`Authorizer ${authorizerName} not found in ${props.apiFolderPath}`);
      }

      const lambdaAuthorizer = new nodejsLambda.NodejsFunction(this, `${props.apiName}Lambda${authorizerName}`, {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${props.apiFolderPath}/${authorizerName}.ts`,
        functionName: `${cdk.Stack.of(this).stackName}-${authorizerName}`,
        logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
        environment: this.environment,
        memorySize: this.authorizerMemorySize,
      });
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
      methodResponses: config.methodResponses,
      requestParameters,
      authorizer: config.authRequired ? authorizer : undefined,
      authorizationType: props.cognitoUserPool ? apigateway.AuthorizationType.COGNITO : undefined,
    });
  }

  pathToCamelCase = (path: string) => {
    return path.replace(/^\/|\/$/g, '').split('/').map((s, i) => i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)).join('');
  }
}
