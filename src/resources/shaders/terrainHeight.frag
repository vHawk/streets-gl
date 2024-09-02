#include <versionPrecision>

out vec4 FragColor;

in vec2 vUv;

uniform MainBlock {
    vec4 transform;
    float scale;
};

uniform sampler2D tMap;

void main() {
    float height = texture(tMap, vUv).r;

    FragColor = vec4(height * scale);
}