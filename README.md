# Path-To-Api-Construct

# Purpose
This project was created to provide a concise code base for defining an API in projects using CDK & Typescript, preventing the need for a large amount of boilerplate code in every project.

# How to build

## Before making a PR

> [!WARNING]
> You must build before making a PR!

When making changes to the code, you must also rebuild the library before deploying since this is what will be imported into other projects.

Make sure to update the `CHANGELOG.md` file when you make changes.

Once a PR is merged, you will need to create a release in Github.

# Getting Started

## Project structure

> [!IMPORTANT]
> This tool uses convention over configuration. The structure and contents of the api folder must be as described below.

This construct recursively searches for subfolders in the `apiFolderPath` and for each one looks for a `config.ts` file. If found, it will use the settings in the file to configure an endpoint for that path.

The `config.ts` file should export an object matching the `methodConfig` interface. This object is what configures each method.

```ts
import { methodConfig } from 'path-to-api-construct';

export const config : methodConfig = {
  methods: {
    'GET': {
      model: null,
      authRequired: false,
    },
  }
}
```

Take the below structure for example:

```
<api-root>
  - foo
    - config.ts
    - get.ts
    - post.ts
    - bar
      - config.ts
      - get.ts
      - post.ts
        
```

Given the above folder structure, if each `config.ts` file contains the above code, then the following apis will be created:

- GET {api-endpoint}/foo
- GET {api-endpoint}/foo/bar

Note that the `post.ts` files are ignored because they are not referenced in the `config.ts` file. If each `config.ts` file instead looks like this:

```ts
import { methodConfig } from 'path-to-api-construct';

export const config : methodConfig = {
  methods: {
    'GET': {
      model: null,
      authRequired: false,
    },
  }
}
```

then the following apis will be created:

- GET {api-endpoint}/foo
- POST {api-endpoint}/foo
- GET {api-endpoint}/foo/bar
- POST {api-endpoint}/foo/bar

## Localstack

>[!INFO]
>Localstack is not technically required by this tool but it is recommended for development. See the [LocalStack docs](https://docs.localstack.cloud/getting-started/installation/) for information on how to install.

Localstack is used to provide a local api for testing. To use localstack, set the `isLocalStack` flag to `true` in the `config.ts` file. You must also provide the `tsBaseOutputFolder` and `tsApiOutputFolder` properties to the construct. These should be set to the base and api output folders for your ts project.

> [!NOTE]
> The entire `tsBaseOutputFolder` will be bundled into the Lambda for each method while the `tsApiOutputFolder` will be used to find the files for each api method.

### Configuring your package.json

When using LocalStack, your app will be responsible for starting Localstack, performing the initial deploy, as well as transpiling the source Typescript source code into the folder specified by `tsApiOutputFolder`. You'll also want to have `tsc --watch` running to ensure that the source code is transpiled as it changes.

It's recommended to use `npm-run-all` to run the `localstack` and `watch` scripts in parallel. You can install this by running:

> npm install npm-run-all --save-dev

Then when you first start the app, you'll want to run `npm run deploy-local` to perform the initial deploy. This can be accomplished by adding the following to your `package.json`:

```json
"scripts": {
  "watch": "cd src && tsc -w",
  "localstack": "localstack start",
  "deploy-local": "cdklocal bootstrap && cdklocal deploy --require-approval never",
  "start": "npm-run-all -p localstack watch"
}
```

By running `npm run start`, the `localstack` and `watch` scripts will be run in parallel. The `localstack` script will start LocalStack, and the `watch` script will run `tsc --watch` in the `tsBaseOutputFolder`. This will ensure that the source code is transpiled as it changes.

## Properties

> [!TIP]
> See the `IApiProps` interface in the source code for more details on each property.

At minimum, you must provide the `apiName` and `apiFolderPath` properties.

| Property | Type | Required | Description |
| -------- | ---- | -------- | ----------- |
| apiName | string | Yes | The name of the api. This is used to name the api and resources created. |
| apiFolderPath | string | Yes | The absolute path to the folder containing the source api configuration and methods. |
| clientHostUrl | string | No | The url of the client host. This is used to configure the api's base url. |
| environment | { [key: string]: string } | No | The environment variables to pass to the api's Lambda methods. |
| domainConfig | IDomainConfig | No | The domain configuration to use for the api. |
| deployOptions | cdk.aws_apigateway.RestApiProps | No | The api's deploy options. |
| lambdaMemorySize | number | No | The memory size of the api's Lambda methods. |
| authorizerMemorySize | number | No | The memory size of the api's authorizer Lambda method. |
| functionProps | cdk.aws_lambda_nodejs.NodejsFunctionProps | No | The props to pass to the api's Lambda methods. |
| isLocalStack | boolean | No | Whether we are deploying to localstack. When true, hot reloading is enabled and the `tsBaseOutputFolder` and `tsApiOutputFolder` must be provided. |
| tsBaseOutputFolder | string | No | The absolute path of the base ts output folder. When isLocalStack is true, this is required. |
| tsApiOutputFolder | string | No | The absolute path of the transpiled api folder. When isLocalStack is true, this is required. |

## Example Usage

```ts
import { CustomAPI } from 'path-to-api-construct';

const api = new CustomAPI(this, 'RecordRequestApi', {
  apiName: 'MyApi',
  apiFolderPath: path.join(__dirname, '..', 'src', 'api'),
  isLocalStack: true,
  tsBaseOutputFolder: path.join(__dirname, '..', 'src', 'dist'),
  tsApiOutputFolder: path.join(__dirname, '..', 'src', 'dist', 'api'),
});
```