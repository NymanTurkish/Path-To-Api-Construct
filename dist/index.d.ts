import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
export interface methodConfig {
    methods: {
        [method: string]: {
            authRequired: boolean;
            authorizer?: string;
            model: any;
        };
    };
}
interface apiRoute {
    routes: {
        [name: string]: apiRoute;
    };
    methods: {
        [method: string]: any;
    };
    resource: apigateway.IResource;
}
interface domainConfig {
    baseName?: string;
    name: string;
    certificate: cdk.aws_certificatemanager.Certificate;
}
interface apiProps {
    apiName: string;
    apiFolderPath: string;
    clientHostUrl?: string;
    environment?: {
        [key: string]: string;
    };
    domainConfig?: domainConfig;
    deployOptions?: apigateway.RestApiProps;
    lambdaMemorySize?: number;
    authorizerMemorySize?: number;
}
export declare class CustomAPI extends Construct {
    authorizers: {
        [key: string]: apigateway.RequestAuthorizer;
    };
    lambdas: {
        [key: string]: lambda.Function;
    };
    environment?: {
        [key: string]: string;
    };
    clientHostUrl?: string;
    adminRole: iam.Role;
    lambdaMemorySize: number;
    authorizerMemorySize: number;
    apiGateway: cdk.aws_apigateway.RestApi;
    lambdasReady: Promise<void>;
    private lambdasReadyResolve;
    constructor(scope: Construct, id: string, props: apiProps);
    traverse: (currentPath: string, currentNode: apiRoute, props: apiProps, parentName?: string) => Promise<void>;
    addMethod: (type: string, resource: apigateway.IResource, pathToMethod: string, config: any, methodName: string, props: apiProps) => Promise<void>;
    pathToCamelCase: (path: string) => string;
}
export {};
