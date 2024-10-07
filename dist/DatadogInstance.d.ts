import { Construct } from 'constructs';
import { LambdaFunction } from "datadog-cdk-constructs-v2/lib/interfaces";
import { ENV } from './NodejsFunction';
export declare const DATADOG_API_KEY_SECRET_NAME = "datadog/api_key";
/**
 * Singleton class to create a Datadog instance.
 */
export declare class DatadogInstance {
    private static DatadogInstance;
    private datadogApiSecret;
    private datadog;
    private constructor();
    static getInstance(scope: Construct, env: ENV): DatadogInstance;
    addLambdaFunctions(lambdas: LambdaFunction[]): void;
}
