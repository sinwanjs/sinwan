I need to create a factory for the server module to avoid rewriting code multiple times in different modes: hydration, renderer, stream.

The factory should be able to create different instances of the server module based on the mode.

The factory should be able to create the following instances:

- Hydration instance
- Renderer instance
- Stream instance

steps:

- Regroup all the common methods in a base folder in each method in separated files to make migration easier
- Create a factory class
- Create a base class for the server module
- Create the three instances (hydration, renderer, stream)
- Create the factory methods to create the instances
- Use the factory to create the instances
