import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { NodejsFunctionProps } from './NodejsFunction';
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
    resource: cdk.aws_apigateway.IResource;
}
interface IDomainConfig {
    baseName?: string;
    name: string;
    certificate: cdk.aws_certificatemanager.Certificate;
}
export interface IApiProps {
    apiName: string;
    apiFolderPath: string;
    clientHostUrl?: string;
    environment?: {
        [key: string]: string;
    };
    domainConfig?: IDomainConfig;
    deployOptions?: cdk.aws_apigateway.RestApiProps;
    lambdaMemorySize?: number;
    authorizerMemorySize?: number;
    functionProps?: Extract<NodejsFunctionProps, cdk.aws_lambda_nodejs.NodejsFunctionProps>;
    /**
     * @see NodejsFunctionProps.isLocalStack
     */
    isLocalStack?: boolean;
    /**
     * @see NodejsFunctionProps.tsBuildOutputFolder
     */
    tsBuildOutputFolder?: string;
    /**
     * @see NodejsFunctionProps.sourcePath
     */
    sourcePath: string;
}
export declare class CustomAPI extends Construct {
    authorizers: {
        [key: string]: cdk.aws_apigateway.RequestAuthorizer;
    };
    lambdas: {
        [key: string]: lambda.Function;
    };
    environment?: {
        [key: string]: string;
    };
    clientHostUrl?: string;
    lambdaMemorySize: number;
    authorizerMemorySize: number;
    apiGateway: cdk.aws_apigateway.RestApi;
    /**
     * @deprecated use waitForLambdasReady instead
     */
    lambdasReady: Promise<void>;
    waitForLambdasReady: Promise<{
        [key: string]: lambda.Function;
    }>;
    localstackHotReloadBucket: cdk.aws_s3.IBucket;
    /**
     * @deprecated use onLambdasReadyResolve instead
     */
    private lambdasReadyResolve;
    private onLambdasReadyResolve;
    constructor(scope: Construct, id: string, props: IApiProps);
    traverse: (currentPath: string, currentNode: apiRoute, props: IApiProps, parentName?: string) => Promise<void>;
    addMethod: (type: string, resource: cdk.aws_apigateway.IResource, pathToMethod: string, config: any, methodName: string, props: IApiProps) => Promise<void>;
    pathToCamelCase: (path: string) => string;
}
export {};
