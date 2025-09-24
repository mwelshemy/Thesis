class UserController {
    constructor(name) {
        this.username = name;
    }

    printUser() {
        console.log("User: " + this.username);
    }
}
function helperFunction() {
    return true;
}