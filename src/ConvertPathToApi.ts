import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import { NodejsFunction, NodejsFunctionProps } from './NodejsFunction';


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
  domainConfig?: IDomainConfig
  deployOptions?: cdk.aws_apigateway.RestApiProps;
  lambdaMemorySize?: number;
  authorizerMemorySize?: number;
  functionProps?: Extract<NodejsFunctionProps, cdk.aws_lambda_nodejs.NodejsFunctionProps>;
  /**
   * @see NodejsFunctionProps.tsBuildOutputFolder
   */
  tsBuildOutputFolder?: NodejsFunctionProps['tsBuildOutputFolder'];
  /**
   * @see NodejsFunctionProps.sourcePath
   */
  sourcePath: NodejsFunctionProps['sourcePath'];
  /**
   * @see NodejsFunctionProps.environment
   */
  environment: NodejsFunctionProps['environment'];
};

/**
 * Returns the api folder path in the tsBuildOutputFolder if ENV is "local" otherwise in the sourcePath.
 * @param props 
 * @returns 
 */
function getApiFolderPath(props: IApiProps) {
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
async function getConfigFromPath(directory: string, props: IApiProps) {
  let configPath = path.join(directory, `config.${props.environment.ENV === 'local' ? 'js' : 'ts'}`);

  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  const { config } = await import(configPath);
  return config as apiRoute;
}

function throwIfAuthorizerNotFound(apiFolderPath: string, authorizerName: string, props: IApiProps) {
  const authorizerPath = path.join(apiFolderPath, `${authorizerName}.${props.environment.ENV === 'local' ? 'js' : 'ts'}`);
  if (!fs.existsSync(authorizerPath)) {
    throw new Error(`Authorizer ${authorizerName} not found in ${apiFolderPath}`);
  }
}

export class CustomAPI extends Construct {
  authorizers: { [key: string]: cdk.aws_apigateway.RequestAuthorizer } = {};
  lambdas: { [key: string]: lambda.Function } = {};
  environment: NodejsFunctionProps['environment'];;
  clientHostUrl?: string;
  lambdaMemorySize: number;
  authorizerMemorySize: number;
  apiGateway: cdk.aws_apigateway.RestApi;

  /**
   * @deprecated use waitForLambdasReady instead
   */
  lambdasReady: Promise<void>;
  waitForLambdasReady: Promise<{ [key: string]: lambda.Function }>;
  localstackHotReloadBucket: cdk.aws_s3.IBucket;

  /**
   * @deprecated use onLambdasReadyResolve instead
   */
  private lambdasReadyResolve: () => void;
  private onLambdasReadyResolve: (lambdas: { [key: string]: lambda.Function }) => void;

  constructor(scope: Construct, id: string, props: IApiProps) {
    super(scope, id);
    this.environment = props.environment;
    this.clientHostUrl = props.clientHostUrl ?? '*';
    this.lambdaMemorySize = props.lambdaMemorySize ?? 128;
    this.authorizerMemorySize = props.authorizerMemorySize ?? 128;

    this.waitForLambdasReady = new Promise<{ [key: string]: lambda.Function }>((resolve) => {
      this.onLambdasReadyResolve = resolve;
    });

    /**
     * @deprecated use waitForLambdasReady instead
     */
    this.lambdasReady = new Promise<void>((resolve) => {
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
      this.onLambdasReadyResolve(this.lambdas);
      this.lambdasReadyResolve();
    });
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
    const relativePathToMethod = pathToMethod.substring(props.sourcePath.length + 1); /* +1 to remove leading / */

    const method = NodejsFunction.generate(this, `${methodName}Function`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: this.environment,
      functionName: `${cdk.Stack.of(this).stackName}-${methodName}`,
      logGroup: new cdk.aws_logs.LogGroup(this, `${methodName}LogGroup`, {
        logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-${methodName}`,
        retention: cdk.aws_logs.RetentionDays.ONE_YEAR
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: this.lambdaMemorySize,
      ...props.functionProps,
      ...config.functionProps,
      tsBuildOutputFolder: props.tsBuildOutputFolder,
      sourcePath: props.sourcePath,
      relativePathToHandler: path.join(relativePathToMethod, `${type.toLowerCase()}.ts`),
    });

    this.lambdas[methodName.toLowerCase()] = method;

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

      const lambdaAuthorizer = NodejsFunction.generate(this, `${props.apiName}Lambda${authorizerName}`, {
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
  }

  pathToCamelCase = (path: string) => {
    return path.replace(/^\/|\/$/g, '').split('/').map((s, i) => i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)).join('');
  }
}
