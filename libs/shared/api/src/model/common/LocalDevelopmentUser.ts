export interface LocalDevelopmentUser {
    email: string;
    name: string;
    initials: string;
    role: string;
}

const LOCAL_DEVELOPMENT_USER: LocalDevelopmentUser = {
    email: 'anton.novikov02@marsh.com',
    name: 'Anton Novikov',
    initials: 'AN',
    role: 'TPM',
};

export default LOCAL_DEVELOPMENT_USER;