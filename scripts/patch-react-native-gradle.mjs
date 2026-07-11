import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve("node_modules/@react-native/gradle-plugin/settings.gradle.kts");
const expoTarget = resolve("node_modules/expo-modules-autolinking/android/expo-gradle-plugin/settings.gradle.kts");
const line = 'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0") }\n\n';
const repositories = `  repositories {\n    maven { url = uri("http://127.0.0.1:4873/gradle-plugin"); isAllowInsecureProtocol = true }\n    maven { url = uri("http://127.0.0.1:4873/google"); isAllowInsecureProtocol = true }\n    maven { url = uri("http://127.0.0.1:4873/public"); isAllowInsecureProtocol = true }\n    maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }\n    maven { url = uri("https://maven.aliyun.com/repository/google") }\n    maven { url = uri("https://maven.aliyun.com/repository/public") }`;

if (existsSync(target)) {
  let source = readFileSync(target, "utf8").replace(line, "");
  if (!source.includes("127.0.0.1:4873/gradle-plugin")) source = source.replace("  repositories {", repositories);
  writeFileSync(target, source, "utf8");
}

if (existsSync(expoTarget)) {
  let source = readFileSync(expoTarget, "utf8");
  if (!source.includes("127.0.0.1:4873/gradle-plugin")) source = source.replace("  repositories {", repositories);
  writeFileSync(expoTarget, source, "utf8");
}
