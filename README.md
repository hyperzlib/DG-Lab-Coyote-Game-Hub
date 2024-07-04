<h1 align="center"> 战败惩罚——郊狼OBS组件</h1>

## 注意事项

请遵守直播平台的相关规定，不要违规使用本组件，如果使用本组件造成直播间封禁等后果与本组件作者无关。

## 使用方法（二进制发行版）

1. 从[Github Actions](https://github.com/hyperzlib/DG-Lab-Coyote-Streaming-Widget/actions)下载编译后的文件：[点击跳转](https://github.com/hyperzlib/DG-Lab-Coyote-Streaming-Widget/actions)
2. 解压后运行```dg-lab-streaming-widget-server.exe```启动服务器

## 使用方法（命令行）

（以下样例中使用了```pnpm```安装依赖，你也可以使用```npm```或者```yarn```）

1. 进入```server```目录，运行```pnpm install```安装依赖

2. 进入```frontend```目录，运行```pnpm install```安装依赖

3. 在项目根目录运行```pnpm install```安装依赖，运行```npm run build```编译项目

4. 在项目根目录运行```npm start```启动服务器

5. 浏览器打开```http://localhost:8920```，即可看到控制面板

## 项目结构

- ```server```：服务器端代码
- ```frontend```：前端代码
