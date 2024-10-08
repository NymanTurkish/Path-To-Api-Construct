import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Datadog } from "datadog-cdk-constructs-v2";
import { LambdaFunction } from "datadog-cdk-constructs-v2/lib/interfaces";
import { ENV } from './NodejsFunction';


export const DATADOG_API_KEY_SECRET_NAME = 'datadog/api_key';

/**
 * Singleton class to create a Datadog instance.
 */
export class DatadogInstance {
  private static DatadogInstance: DatadogInstance;

  private datadogApiSecret: cdk.aws_secretsmanager.ISecret;
  private datadog: Datadog;

  private constructor(scope: Construct, env: ENV) {
    this.datadogApiSecret = cdk.aws_secretsmanager.Secret.fromSecretNameV2(scope, 'Datadog API Key', DATADOG_API_KEY_SECRET_NAME);
    this.datadog = new Datadog(scope, "Datadog", {
      nodeLayerVersion: 113,
      extensionLayerVersion: 62,
      site: "us5.datadoghq.com",
      env: env,
      captureLambdaPayload: true,
      apiKeySecretArn: this.datadogApiSecret.secretArn,
    });
  }

  public static getInstance(scope: Construct, env: ENV) {
    if (!DatadogInstance.DatadogInstance) {
      DatadogInstance.DatadogInstance = new DatadogInstance(scope, env);
    }
    return DatadogInstance.DatadogInstance;
  }

  public addLambdaFunctions(lambdas: LambdaFunction[]) {
    lambdas.forEach((lam) => this.datadogApiSecret.grantRead(lam));
    this.datadog.addLambdaFunctions(lambdas);
  }
}
