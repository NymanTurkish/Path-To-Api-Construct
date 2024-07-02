# Path-To-Api-Construct
You must build before making a PR!

## Change Log
### v0.5
- Exposes the `functionProps` on `apiProps` so that you can provide additional function parameters to be applied during creation.
- Makes `apiProps` usable.

### v0.4
- Adds the ability to access functions that are created during call to build CustomAPI
  - You can now access the functions by waiting for the `lambdasReady` promise in the stack file:
  ```ts
  const api = new CustomAPI(this, 'TestConstruct', apiProps);
  api.lambdasReady.then(() => {
    const testLambda = api.lambdas['testLambda_GET']
    testLambda.addEnvironment('EXAMPLE', 'value');
  });
  ```
- The created Gateway is also now exposed via the `apiGateway` property
- The naming convention for lambdas ending with a path value (i.e. `{id}`) has been changed
  - The lambda will now contain the name of the root parent folder, in addition to the path variable and method
  - For example, `_id_GET` will now become `test_id_GET` or `example_id_GET`.

### v0.3
- Adds two new props, lambdaMemorySize and authorizerMemorySize, to apiProps
- Allows the user to add any needed function overrides inside of the method config by using `functionProps`. For example, if you wanted to change the memorySize of a specific lambda:
```ts
export const config : methodConfig = {
  methods: {
    'GET': {
      model: {
        requestParameters: {
          'method.request.querystring.exchangeId': true,
          'method.request.querystring.startTime': true
        }
      },
      authRequired: true,
      authorizer: 'salesforce-authorizer',
      functionProps: {
        memorySize: 512
      }
    }
  }
}
```
- Actually building the previous two releases...

### v0.2
- Adds the ability to support multiple authorizers
  - To use a specific authorizer, add the name of the authorizer (without the `.ts` suffix) to the options file for the method:
  ```ts
  export const config : methodConfig = {
    methods: {
      'GET': {
        model: {
          requestParameters: {
            'method.request.querystring.exchangeId': true,
            'method.request.querystring.startTime': true
          }
        },
        authRequired: true,
        authorizer: 'salesforce-authorizer'
      }
    }
  }
  ```
  - If not specificed, the `default-authorizer` will be used
#### Breaking Changes
- Existing `authorizer.ts` files MUST be renamed to `default-authorizer.ts`

### v0.1
- Current version
