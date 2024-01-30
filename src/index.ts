import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
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

export interface methodConfig {
  methods: {
    [method: string]: {
      authRequired: boolean;
      model: any;
    };
  };
};

interface apiRoute {
  routes: {[name: string]: apiRoute},
  methods: {[method: string]: any},
  resource: apigateway.IResource
};

interface domainConfig {
  name: string;
  certificate: cdk.aws_certificatemanager.Certificate;
}

interface apiProps {
  apiFolderPath: string;
  clientHostUrl: string;
  environment?: { [key: string]: string },
  domainConfig?: domainConfig;
};

export class CustomAPI extends Construct {
  authorizer: apigateway.RequestAuthorizer;
  environment?: { [key: string]: string };
  adminRole: iam.Role;

  constructor(scope: Construct, id: string, props: apiProps) {
    super(scope, id);
    this.environment = props.environment;

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

    const api = new apigateway.RestApi(this, 'ApplicationPortalAPI', {
      domainName,
      defaultCorsPreflightOptions: {
        allowOrigins: [props.clientHostUrl],
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
        'Access-Control-Allow-Origin': `'${props.clientHostUrl}'`,
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
        'Access-Control-Allow-Origin': `'${props.clientHostUrl}'`,
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
        'Access-Control-Allow-Origin': `'${props.clientHostUrl}'`,
        'Access-Control-Allow-Credentials': '\'true\''
      },
      templates: {
        'application/json': '{ "message": "Internal Server Error" }'
      }
    });

    if (props.domainConfig) {
      const zone = route53.HostedZone.fromLookup(this, 'ApplicationPortalDomainZone', { domainName: props.domainConfig.name });

      new route53.ARecord(this, 'ApplicationPortalAPIRecord', {
        zone: zone,
        recordName: `api.${props.domainConfig.name}`,
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
      resultsCacheTtl: cdk.Duration.seconds(0)
    });
    this.authorizer._attachToApi(api);
    
    const routes: apiRoute = {
      routes: {},
      methods: {},
      resource: api.root
    };
  
    const traverse = async (currentPath: string, currentNode: apiRoute) => {
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
            const { config } = await import(configPath);

            if (config.methods) {
              for(const method in config.methods) {
                currentNode.routes[entry].methods[method] = this.addMethod(method, resource, fullPath, config.methods[method], entry);
              }
            }
          }
          
          traverse(fullPath, currentNode.routes[entry]);
        }
      };
    }
  
    traverse(path.join(__dirname, props.apiFolderPath), routes);
  }

  addMethod = async (type: string, resource: apigateway.IResource, pathToMethod: string, config: any, entry: string) => {
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
      switch(type) {
        case HttpMethod.GET:
          requestParameters = config.model.requestParameters;
          break;
        case HttpMethod.POST:
          requestModels = {
            [config.model.contentType]: new apigateway.Model(
              this, 
              `${name}RequestModel`, 
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

    resource.addMethod(type, new apigateway.LambdaIntegration(method), {
      requestValidatorOptions: {
        validateRequestBody: type === 'POST',
        validateRequestParameters: type === 'GET'
      },
      requestModels,
      requestParameters,
      authorizer: config.authRequired ? this.authorizer : undefined
    });
  }

  pathToCamelCase = (path: string) => {
    return path.replace(/^\/|\/$/g, '').split('/').map((s, i) => i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)).join('');
  }
}