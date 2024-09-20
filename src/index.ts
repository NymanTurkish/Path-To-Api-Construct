import * as cdk from 'aws-cdk-lib';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
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
    };
  };
};

interface apiRoute {
  routes: {[name: string]: apiRoute},
  methods: {[method: string]: any},
  resource: cdk.aws_apigateway.IResource
};

interface IDomainConfig {
  baseName?: string; // Used when base domain already exists, and name is a subdomain. Otherwise leave empty.
  name: string;
  certificate: cdk.aws_certificatemanager.Certificate;
}

export interface IApiProps {
  apiName: string;
  apiFolderPath: string;
  clientHostUrl?: string;
  environment?: { [key: string]: string },
  domainConfig?: IDomainConfig
  deployOptions?: cdk.aws_apigateway.RestApiProps;
  lambdaMemorySize?: number;
  authorizerMemorySize?: number;
  functionProps?: nodejsLambda.NodejsFunctionProps;
  /**
   * Whether we are deploying to localstack. When true, hot reloading is enabled and the `tsBaseOutputFolder` and `tsApiOutputFolder` must be provided.
   */
  isLocalStack?: boolean;
  /**
   * The absolute path of the base ts output folder. When isLocalStack is true, this is required.
   */
  tsBaseOutputFolder?: string;
  /**
   * The absolute path of the transpiled api folder. When isLocalStack is true, this is required.
   */
  tsApiOutputFolder?: string;
};

/**
 * Returns the api folder path based on the isLocalStack flag.
 * @param props 
 * @returns 
 */
function getApiFolderPath(props: IApiProps) {
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
async function getConfigFromPath(directory: string, props: IApiProps) {
  let configPath = path.join(directory, `config.${props.isLocalStack ? 'js' : 'ts'}`);

  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  const { config } = await import(configPath);
  return config as apiRoute;
}

function throwIfAuthorizerNotFound(apiFolderPath: string, authorizerName: string, props: IApiProps) {
  const authorizerPath = path.join(apiFolderPath, `${authorizerName}.${props.isLocalStack ? 'js' : 'ts'}`);
  if (!fs.existsSync(authorizerPath)) {
    throw new Error(`Authorizer ${authorizerName} not found in ${apiFolderPath}`);
  }
}

export class CustomAPI extends Construct {
  authorizers: { [key: string]: cdk.aws_apigateway.RequestAuthorizer } = {};
  lambdas: { [key: string]: lambda.Function } = {};
  environment?: { [key: string]: string };
  clientHostUrl?: string;
  adminRole: iam.Role;
  lambdaMemorySize: number;
  authorizerMemorySize: number;
  apiGateway: cdk.aws_apigateway.RestApi;
  lambdasReady: Promise<void>;
  localstackHotReloadBucket: cdk.aws_s3.IBucket;

  private lambdasReadyResolve: () => void;

  constructor(scope: Construct, id: string, props: IApiProps) {
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

    if (props.isLocalStack) {
      this.localstackHotReloadBucket = cdk.aws_s3.Bucket.fromBucketName(this, 'HotReloadBucket', 'hot-reload');
    }

    let domainName = undefined;
    if (props.domainConfig) {
      domainName = {
        domainName: `api.${props.domainConfig.name}`,
        certificate: props.domainConfig.certificate,
        endpointType: cdk.aws_apigateway.EndpointType.EDGE,
        securityPolicy: cdk.aws_apigateway.SecurityPolicy.TLS_1_2
      }
    }

    const gatewayOptions = props.deployOptions ?? {};

    const api = new cdk.aws_apigateway.RestApi(this, `${props.apiName}API`, {
      domainName,
      defaultCorsPreflightOptions: {
        allowOrigins: [this.clientHostUrl],
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
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
  
    this.traverse(getApiFolderPath(props), routes, props).then(() => {
      this.lambdasReadyResolve();
    });
  }

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
  private getLambdaEntryPoint = (props: IApiProps, pathToMethod: string, entryPoint: string) => {
    if (props.isLocalStack) {    
      if (!props.tsBaseOutputFolder) {
        throw new Error('tsBaseOutputFolder is required when isLocalStack is true');
      }

      return {
        code: cdk.aws_lambda.Code.fromBucket(this.localstackHotReloadBucket, props.tsBaseOutputFolder!),
        handler: path.join(pathToMethod.substring(props.tsBaseOutputFolder!.length + 1 /* +1 to remove leading / */), `${entryPoint}.handler`),
      }
    } else {
      return {
        entry: path.join(pathToMethod, `${entryPoint}.ts`),
      }
    }
  }

  traverse = async (currentPath: string, currentNode: apiRoute, props: IApiProps, parentName: string = '') => {
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

        const config = await getConfigFromPath(fullPath, props);

        if (config?.methods) {
          for(const method in config.methods) {
            const methodName = `${routeName}_${method}`;
            currentNode.routes[entry].methods[method] = this.addMethod(method, resource, fullPath, config.methods[method], methodName, props);
          }
        }
        
        await this.traverse(fullPath, currentNode.routes[entry], props, routeName);
      }
    };
  }

  addMethod = async (type: string, resource: cdk.aws_apigateway.IResource, pathToMethod: string, config: any, methodName: string, props: IApiProps) => {
    if (props.isLocalStack && !props.tsBaseOutputFolder) {
      throw new Error('tsBaseOutputFolder is required when isLocalStack is true');
    }

    let methodProps : nodejsLambda.NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: this.environment,
      role: this.adminRole,
      logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
      functionName: `${cdk.Stack.of(this).stackName}-${methodName}`,
      timeout: cdk.Duration.seconds(30),
      memorySize: this.lambdaMemorySize,
      ...props.functionProps,
      ...config.functionProps,
      ...this.getLambdaEntryPoint(props, pathToMethod, type.toLowerCase()),
    };
    
    const method = new nodejsLambda.NodejsFunction(this, `${methodName}Function`, methodProps);

    this.lambdas[methodName] = method;

    let requestModels, requestParameters;

    if (config.model) {
      switch(type) {
        case HttpMethod.GET:
          requestParameters = config.model.requestParameters;
          break;
        case HttpMethod.POST:
          requestModels = {
            [config.model.contentType]: new cdk.aws_apigateway.Model(
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
    } else {
      const apiFolderPath = getApiFolderPath(props);


      throwIfAuthorizerNotFound(apiFolderPath, authorizerName, props);

      let authorizerProps : nodejsLambda.NodejsFunctionProps = {
        runtime: lambda.Runtime.NODEJS_18_X,
        functionName: `${cdk.Stack.of(this).stackName}-${authorizerName}`,
        logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
        environment: this.environment,
        memorySize: this.authorizerMemorySize,
        ...this.getLambdaEntryPoint(props, apiFolderPath, authorizerName),
      };

      const lambdaAuthorizer = new nodejsLambda.NodejsFunction(this, `${props.apiName}Lambda${authorizerName}`, authorizerProps);
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
  }

  pathToCamelCase = (path: string) => {
    return path.replace(/^\/|\/$/g, '').split('/').map((s, i) => i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)).join('');
  }
}
