import * as cdk from 'aws-cdk-lib';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
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
    functionProps?: nodejsLambda.NodejsFunctionProps;
    /**
     * Whether we are deploying to localstack. When true, hot reloading is enabled and the `tsBaseOutputFolder` and `tsApiOutputFolder` must be provided.
     */
    isLocalStack?: boolean;
    /**
     * The absolute path of the transpiled api folder. When isLocalStack is true, this is required.
     */
    tsApiOutputFolder?: string;
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
    /**
     * Returns the lambda entry point.
     * If we are in localstack mode, we need to use the tsApiOutputFolder and the handler will be the entry point.ts file.
     * This allows for hot reloading and ensures that code above the api base folder is available for import
     * If we are not in localstack mode, we can use the path to the method.
     * @param props
     * @param pathToMethod
     * @param entryPoint
     * @returns
     */
    private getLambdaEntryPoint;
    traverse: (currentPath: string, currentNode: apiRoute, props: IApiProps, parentName?: string) => Promise<void>;
    addMethod: (type: string, resource: cdk.aws_apigateway.IResource, pathToMethod: string, config: any, methodName: string, props: IApiProps) => Promise<void>;
    pathToCamelCase: (path: string) => string;
}
export {};
